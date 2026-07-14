import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import {
  detectSport,
  formatFemeninoLabel,
  isJunkMatch,
  repairMisparsedMatch,
  type SportKind,
} from '@/lib/match-display';
import {
  addDaysYmd,
  hasKickoffTime,
  isMatchStillOpenPeru,
  peruDateISO,
  resolveKickoffPeru,
} from '@/lib/timezone';
import { eventsOnDay, findEventInDayList, type SportsDbEvent } from '@/lib/sportsdb/client';
import {
  isSportsDbFinished,
  resolveEventKickoffPeru,
  shouldPreferSportsDbKickoff,
} from '@/lib/sportsdb/kickoff';
import { resolveEventId } from '@/lib/sportsdb/match-status';

async function loadSportsDbDayEvents(ymd: string): Promise<SportsDbEvent[]> {
  const [soccer, anySport] = await Promise.all([
    eventsOnDay(ymd, 'Soccer'),
    eventsOnDay(ymd),
  ]);
  const byId = new Map<string, SportsDbEvent>();
  for (const ev of [...soccer, ...anySport]) {
    const id = ev.idEvent ?? `${ev.strEvent}-${ev.strTime}`;
    byId.set(id, ev);
  }
  return Array.from(byId.values());
}

/**
 * Lista partidos con predicciones.
 * Sin hora tipster → misma API TheSportsDB que el análisis de resultados en vivo.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const todayPeru = peruDateISO();
  const date = searchParams.get('date') ?? todayPeru;
  const league = searchParams.get('league');
  const source = searchParams.get('source');
  const sportFilter = (searchParams.get('sport') ?? '').trim().toLowerCase() as SportKind | '';
  const hideFinished = searchParams.get('hideFinished') !== '0';
  const limitRaw = Number(searchParams.get('limit') ?? 800);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 800, 50), 1500);

  const fromYmd = addDaysYmd(date, -1);
  const toYmd = addDaysYmd(date, 1);
  const dayStart = new Date(`${fromYmd}T00:00:00.000Z`);
  const dayEnd = new Date(`${toYmd}T23:59:59.999Z`);

  const matches = await prisma.match.findMany({
    where: {
      matchDate: { gte: dayStart, lte: dayEnd },
      ...(league ? { league: { contains: league } } : {}),
      ...(source
        ? { predictions: { some: { source: { slug: source } } } }
        : {}),
    },
    include: {
      predictions: {
        include: { source: { select: { name: true, slug: true } } },
        orderBy: { scrapedAt: 'desc' },
        take: 5,
      },
    },
    orderBy: [{ matchDate: 'asc' }, { kickoff: 'asc' }, { league: 'asc' }],
    take: Math.min(limit * 2, 2000),
  });

  const dayEvents = (
    await Promise.all([
      loadSportsDbDayEvents(fromYmd),
      loadSportsDbDayEvents(date),
      loadSportsDbDayEvents(toYmd),
    ])
  ).flat();
  const eventsById = new Map<string, SportsDbEvent>();
  for (const ev of dayEvents) {
    if (ev.idEvent) eventsById.set(ev.idEvent, ev);
  }
  const uniqueDayEvents = Array.from(eventsById.values());

  const now = new Date();
  let sportsDbLookups = 0;
  /** Prioridad: sin hora tipster; luego Mundiales / FIFA */
  const MAX_RESOLVE_LOOKUPS = 24;
  const persistKickoffs: Array<{ id: string; kickoff: string }> = [];

  const repaired = [];
  for (const m of matches) {
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const fixed = repairMisparsedMatch({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff,
      league: m.league,
    });
    const homeTeam = formatFemeninoLabel(fixed.homeTeam);
    const awayTeam = formatFemeninoLabel(fixed.awayTeam);
    const leagueLabel = formatFemeninoLabel(m.league);
    const sport = detectSport(m.league, note);
    const storedYmd = peruDateISO(new Date(m.matchDate));
    const baseYmd = m.matchDate
      ? `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`
      : storedYmd;
    const tipsterKickoff = fixed.kickoff ?? m.kickoff;
    const tipsterHasTime = hasKickoffTime(tipsterKickoff);
    const tipsterResolved = resolveKickoffPeru({
      matchDateYmd: baseYmd,
      kickoff: tipsterKickoff,
    });

    let event = findEventInDayList(uniqueDayEvents, homeTeam, awayTeam);
    const needsApiTime = !tipsterHasTime || shouldPreferSportsDbKickoff(leagueLabel);

    // Misma resolución que /api/match-status (análisis de resultados)
    if (!event && needsApiTime && sportsDbLookups < MAX_RESOLVE_LOOKUPS) {
      sportsDbLookups += 1;
      const resolved = await resolveEventId({
        homeTeam,
        awayTeam,
        matchDateYmd: baseYmd,
        sportKind: sport,
      });
      event = resolved.event;
      if (event?.idEvent) eventsById.set(event.idEvent, event);
    }

    let kickoff = tipsterResolved.kickoffPeru ?? (tipsterHasTime ? tipsterKickoff : null);
    let matchDatePeru = tipsterResolved.matchDatePeru;
    let kickoffAt = tipsterResolved.kickoffAt;
    let timeSource: 'tipster' | 'thesportsdb' = 'tipster';
    let sportsDbStatus: string | null = null;
    let sportsDbFinished = false;

    if (event) {
      sportsDbStatus = event.strStatus ?? null;
      sportsDbFinished = isSportsDbFinished(event);
      const dbResolved = resolveEventKickoffPeru(event);
      const useDbTime =
        Boolean(dbResolved.kickoffPeru || dbResolved.kickoffAt) &&
        (!tipsterHasTime || shouldPreferSportsDbKickoff(leagueLabel));

      if (useDbTime) {
        kickoff = dbResolved.kickoffPeru ?? kickoff;
        matchDatePeru = dbResolved.matchDatePeru ?? matchDatePeru;
        kickoffAt = dbResolved.kickoffAt ?? kickoffAt;
        timeSource = 'thesportsdb';
        if (kickoff && !hasKickoffTime(m.kickoff)) {
          persistKickoffs.push({ id: m.id, kickoff });
        }
      }
    }

    repaired.push({
      ...m,
      homeTeam,
      awayTeam,
      league: leagueLabel,
      kickoff,
      kickoffTz: 'America/Lima',
      matchDatePeru,
      sport,
      timeSource,
      sportsDbStatus,
      _baseYmd: baseYmd,
      _kickoffSource: tipsterKickoff,
      _kickoffAt: kickoffAt,
      _sportsDbFinished: sportsDbFinished,
    });
  }

  if (persistKickoffs.length) {
    await Promise.all(
      persistKickoffs.map((row) =>
        prisma.match.update({
          where: { id: row.id },
          data: { kickoff: row.kickoff },
        })
      )
    );
  }

  const seen = new Set<string>();
  const filtered = repaired.filter((m) => {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
    if (m.matchDatePeru !== date) return false;

    if (hideFinished && date === todayPeru) {
      if (m._sportsDbFinished) return false;
      if (m._kickoffAt) {
        const end = m._kickoffAt.getTime() + 2.25 * 60 * 60 * 1000;
        if (!m.isLive && now.getTime() >= end) return false;
      } else if (
        !isMatchStillOpenPeru({
          matchDateYmd: m._baseYmd,
          kickoff: m._kickoffSource,
          now,
          isLive: m.isLive,
        })
      ) {
        return false;
      }
    }
    if (sportFilter && m.sport !== sportFilter) return false;
    const key = `${m.homeTeam}|${m.awayTeam}|${m.league}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  filtered.sort((a, b) => (a.kickoff ?? '99').localeCompare(b.kickoff ?? '99'));

  const sports = Array.from(new Set(filtered.map((m) => m.sport))).sort();

  return NextResponse.json({
    matches: filtered.map(
      ({
        _baseYmd,
        _kickoffSource,
        _kickoffAt,
        _sportsDbFinished,
        ...rest
      }) => rest
    ),
    total: filtered.length,
    sports,
    timezone: 'America/Lima',
    today: todayPeru,
    updating: false,
  });
}
