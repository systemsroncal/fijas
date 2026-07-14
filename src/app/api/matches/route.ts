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
  isMatchStillOpenPeru,
  peruDateISO,
  resolveKickoffPeru,
} from '@/lib/timezone';

/**
 * Lista partidos (rápido): Prisma + hora Perú.
 * Finalizados (phase=finished o kickoff+2.5h) se ocultan con hideFinished=1.
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
      ...(hideFinished
        ? {
            OR: [{ phase: null }, { phase: { not: 'finished' } }],
          }
        : {}),
      ...(league ? { league: { contains: league } } : {}),
      ...(source
        ? { predictions: { some: { source: { slug: source } } } }
        : {}),
    },
    include: {
      predictions: {
        include: { source: { select: { name: true, slug: true } } },
        orderBy: { scrapedAt: 'desc' },
        take: 3,
      },
    },
    orderBy: [{ matchDate: 'asc' }, { kickoff: 'asc' }, { league: 'asc' }],
    take: Math.min(limit * 2, 2000),
  });

  const now = new Date();
  const repaired = matches.map((m) => {
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const fixed = repairMisparsedMatch({
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      kickoff: m.kickoff,
      league: m.league,
    });
    const storedYmd = peruDateISO(new Date(m.matchDate));
    const baseYmd = m.matchDate
      ? `${m.matchDate.getUTCFullYear()}-${String(m.matchDate.getUTCMonth() + 1).padStart(2, '0')}-${String(m.matchDate.getUTCDate()).padStart(2, '0')}`
      : storedYmd;
    const tipsterKickoff = fixed.kickoff ?? m.kickoff;
    const resolved = resolveKickoffPeru({
      matchDateYmd: baseYmd,
      kickoff: tipsterKickoff,
    });

    return {
      ...m,
      homeTeam: formatFemeninoLabel(fixed.homeTeam),
      awayTeam: formatFemeninoLabel(fixed.awayTeam),
      league: formatFemeninoLabel(m.league),
      kickoff: resolved.kickoffPeru ?? (tipsterKickoff?.trim() || null),
      kickoffTz: 'America/Lima',
      matchDatePeru: resolved.matchDatePeru,
      sport: detectSport(m.league, note),
      timeSource: /^\d{4}-\d{2}-\d{2}T/.test(tipsterKickoff?.trim() || '')
        ? 'thesportsdb'
        : 'tipster',
      needsKickoffEnrich: !resolved.kickoffAt && !resolved.kickoffPeru,
      _baseYmd: baseYmd,
      _kickoffSource: tipsterKickoff,
      _kickoffAt: resolved.kickoffAt,
    };
  });

  const seen = new Set<string>();
  const filtered = repaired.filter((m) => {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
    if (m.matchDatePeru !== date) return false;
    if (hideFinished && m.phase === 'finished') return false;

    if (hideFinished && date === todayPeru) {
      if (m._kickoffAt) {
        const end = m._kickoffAt.getTime() + 2.5 * 60 * 60 * 1000;
        if (!m.isLive && m.phase !== 'live' && now.getTime() >= end) return false;
      } else if (
        !isMatchStillOpenPeru({
          matchDateYmd: m._baseYmd,
          kickoff: m._kickoffSource,
          now,
          isLive: m.isLive || m.phase === 'live',
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
  const missingKickoff = filtered.filter((m) => m.needsKickoffEnrich).length;

  return NextResponse.json({
    matches: filtered.map(
      ({ _baseYmd, _kickoffSource, _kickoffAt, needsKickoffEnrich, ...rest }) => rest
    ),
    total: filtered.length,
    sports,
    timezone: 'America/Lima',
    today: todayPeru,
    missingKickoff,
    updating: false,
  });
}
