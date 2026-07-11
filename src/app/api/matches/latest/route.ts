import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';

/**
 * Endpoint de polling: partidos actualizados recientemente.
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : new Date(Date.now() - 60 * 60 * 1000);

  const predictions = await prisma.scrapedPrediction.findMany({
    where: { scrapedAt: { gt: since } },
    include: {
      match: true,
      source: { select: { name: true, slug: true } },
    },
    orderBy: { scrapedAt: 'desc' },
    take: 100,
  });

  const latestScraped = await prisma.scrapingSource.findFirst({
    where: { lastScraped: { not: null } },
    orderBy: { lastScraped: 'desc' },
    select: { lastScraped: true },
  });

  return NextResponse.json({
    count: predictions.length,
    predictions,
    serverTime: new Date().toISOString(),
    lastScraped: latestScraped?.lastScraped ?? null,
  });
}
