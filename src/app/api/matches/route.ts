import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { isJunkMatch, repairMisparsedMatch } from '@/lib/match-display';
import { isMatchStillOpen, localDateISO } from '@/lib/local-date';

/**
 * Lista partidos con predicciones recientes (filtros: date, league, source).
 * Repara filas SaferTip mal parseadas y oculta partidos ya terminados del día.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') ?? localDateISO();
  const league = searchParams.get('league');
  const source = searchParams.get('source');
  const hideFinished = searchParams.get('hideFinished') !== '0';

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
    orderBy: [{ matchDate: 'asc' }, { kickoff: 'asc' }],
    take: 200,
  });

  const now = new Date();
  const repaired = matches.map((m) => {
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
    };
  });

  const filtered = repaired.filter((m) => {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) return false;
    if (hideFinished && !isMatchStillOpen(date, m.kickoff, now)) return false;
    return true;
  });

  return NextResponse.json({ matches: filtered, updating: false });
}
