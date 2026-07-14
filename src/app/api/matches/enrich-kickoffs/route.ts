import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import {
  formatFemeninoLabel,
  isJunkMatch,
  repairMisparsedMatch,
} from '@/lib/match-display';
import {
  addDaysYmd,
  hasKickoffTime,
  peruDateISO,
  resolveKickoffPeru,
} from '@/lib/timezone';
import {
  eventsOnDay,
  findEventInDayList,
  type SportsDbEvent,
} from '@/lib/sportsdb/client';
import {
  eventKickoffAt,
  isSportsDbFinished,
  resolveEventKickoffPeru,
  shouldPreferSportsDbKickoff,
} from '@/lib/sportsdb/kickoff';
import { classifyPhase, resolveEventId } from '@/lib/sportsdb/match-status';

function phaseFromEvent(event: SportsDbEvent): 'scheduled' | 'live' | 'finished' {
  if (isSportsDbFinished(event)) return 'finished';
  const hasScore =
    event.intHomeScore != null &&
    event.intHomeScore !== '' &&
    event.intAwayScore != null &&
    event.intAwayScore !== '';
  const p = classifyPhase(event.strStatus, hasScore, false);
  if (p === 'finished' || p === 'live') return p;
  return 'scheduled';
}

/**
 * Background: horas TheSportsDB + marcar finalizados (phase=finished).
 * El listado filtra phase=finished para no mostrar partidos ya jugados.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const date = body.date?.trim() || peruDateISO();
  const fromYmd = addDaysYmd(date, -1);
  const toYmd = addDaysYmd(date, 1);
  const dayStart = new Date(`${fromYmd}T00:00:00.000Z`);
  const dayEnd = new Date(`${toYmd}T23:59:59.999Z`);
  const now = new Date();

  const matches = await prisma.match.findMany({
    where: {
      matchDate: { gte: dayStart, lte: dayEnd },
      OR: [{ phase: null }, { phase: { not: 'finished' } }],
    },
    select: {
      id: true,
      matchDate: true,
      kickoff: true,
      homeTeam: true,
      awayTeam: true,
      league: true,
      phase: true,
      isLive: true,
    },
    take: 400,
  });

  const dayEvents: SportsDbEvent[] = [];
  for (const ymd of [fromYmd, date, toYmd]) {
    const [soccer, any] = await Promise.all([
      eventsOnDay(ymd, 'Soccer'),
      eventsOnDay(ymd),
    ]);
    dayEvents.push(...soccer, ...any);
  }

  let updatedKickoff = 0;
  let markedFinished = 0;
  let markedLive = 0;
  let lookups = 0;
  const MAX_LOOKUPS = 10;

  for (const m of matches) {
    const fixed = repairMisparsedMatch({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff,
      league: m.league,
    });
    const home = formatFemeninoLabel(fixed.homeTeam);
    const away = formatFemeninoLabel(fixed.awayTeam);
    if (isJunkMatch(home, away)) continue;

    const baseYmd = `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`;
    const tipsterKickoff = fixed.kickoff ?? m.kickoff;
    const resolvedLocal = resolveKickoffPeru({
      matchDateYmd: baseYmd,
      kickoff: tipsterKickoff,
    });

    let event = findEventInDayList(dayEvents, home, away);
    const needsLookup =
      !event &&
      lookups < MAX_LOOKUPS &&
      (shouldPreferSportsDbKickoff(m.league) || !hasKickoffTime(tipsterKickoff));

    if (needsLookup) {
      lookups += 1;
      const resolved = await resolveEventId({
        homeTeam: home,
        awayTeam: away,
        matchDateYmd: baseYmd,
        sportKind: 'football',
        bypassCache: false,
      });
      event = resolved.event;
      if (event) dayEvents.push(event);
    }

    const data: {
      kickoff?: string;
      phase?: string;
      isLive?: boolean;
    } = {};

    if (event) {
      const at = eventKickoffAt(event) ?? resolveEventKickoffPeru(event).kickoffAt;
      if (at) {
        const iso = at.toISOString();
        if (m.kickoff !== iso) {
          data.kickoff = iso;
          updatedKickoff += 1;
        }
      }
      const phase = phaseFromEvent(event);
      if (phase === 'finished') {
        data.phase = 'finished';
        data.isLive = false;
        markedFinished += 1;
      } else if (phase === 'live') {
        data.phase = 'live';
        data.isLive = true;
        markedLive += 1;
      } else if (!m.phase) {
        data.phase = 'scheduled';
      }
    } else {
      // Sin evento SportsDB: cerrar por hora (kickoff + 2.5h)
      const endAt = resolvedLocal.kickoffAt
        ? resolvedLocal.kickoffAt.getTime() + 2.5 * 60 * 60 * 1000
        : null;
      if (endAt && now.getTime() >= endAt && !m.isLive) {
        data.phase = 'finished';
        data.isLive = false;
        markedFinished += 1;
      }
    }

    if (Object.keys(data).length) {
      await prisma.match.update({
        where: { id: m.id },
        data,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    date,
    updatedKickoff,
    markedFinished,
    markedLive,
    lookups,
    /** compat dashboard */
    updated: updatedKickoff + markedFinished + markedLive,
  });
}
