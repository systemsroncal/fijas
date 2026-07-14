import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { detectSport, isJunkMatch, repairMisparsedMatch, type SportKind } from '@/lib/match-display';
import { isMatchStillOpen, localDateISO } from '@/lib/local-date';

/**
 * Lista partidos con predicciones recientes.
 * Filtros: date, league, source, sport, limit, hideFinished.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? localDateISO();
  const league = searchParams.get('league');
  const source = searchParams.get('source');
  const sportFilter = (searchParams.get('sport') ?? '').trim().toLowerCase() as SportKind | '';
  const hideFinished = searchParams.get('hideFinished') !== '0';
  const limitRaw = Number(searchParams.get('limit') ?? 800);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 800, 50), 1500);

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const matches = await prisma.match.findMany({
    where: {
      matchDate: { gte: dayStart, lt: dayEnd },
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
    take: limit,
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
    return {
      ...m,
      homeTeam: fixed.homeTeam,
      awayTeam: fixed.awayTeam,
      kickoff: fixed.kickoff ?? m.kickoff,
      sport: detectSport(m.league, note),
    };
  });

  // Deduplicar por equipos+liga (varias fuentes)
  const seen = new Set<string>();
  const filtered = repaired.filter((m) => {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
    if (hideFinished && !isMatchStillOpen(date, m.kickoff, now)) return false;
    if (sportFilter && m.sport !== sportFilter) return false;
    const key = `${m.homeTeam}|${m.awayTeam}|${m.league}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sports = Array.from(new Set(filtered.map((m) => m.sport))).sort();

  return NextResponse.json({
    matches: filtered,
    total: filtered.length,
    sports,
    updating: false,
  });
}
