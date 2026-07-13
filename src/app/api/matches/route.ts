import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';

/**
 * Lista partidos con predicciones recientes (filtros: date, league, source).
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date'); // YYYY-MM-DD
  const league = searchParams.get('league');
  const source = searchParams.get('source');

  const dayStart = date ? new Date(`${date}T00:00:00.000Z`) : startOfTodayUtc();
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

  const junk = /^(time|match|date|good|bad|league|home|away|vs|tbd|n\/?a|-|—)$/i;
  const filtered = matches.filter(
    (m) => !junk.test(m.homeTeam.trim()) && !junk.test(m.awayTeam.trim())
  );

  return NextResponse.json({ matches: filtered, updating: false });
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
