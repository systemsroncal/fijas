import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';

/**
 * Combinadas sugeridas (Predictz, WinDrawWin, Scores24).
 */
export async function GET(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const source = searchParams.get('source');
  const date = searchParams.get('date');

  const dayStart = date ? new Date(`${date}T00:00:00.000Z`) : undefined;
  const dayEnd = dayStart
    ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  const items = await prisma.suggestedAccumulator.findMany({
    where: {
      ...(source ? { sourceSlug: source } : {}),
      ...(dayStart && dayEnd
        ? { matchDate: { gte: dayStart, lt: dayEnd } }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ items });
}
