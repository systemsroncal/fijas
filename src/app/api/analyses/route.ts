import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { decryptSecret } from '@/lib/encryption';
import { analyzeAccumulatorWithFallback } from '@/lib/ai/providers';

const schema = z.object({
  accumulatorId: z.string(),
  provider: z.nativeEnum(AiProvider),
});

/**
 * Analiza una acumulada con IA (fallback automático entre proveedores).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = schema.parse(await request.json());

    const accumulator = await prisma.accumulator.findFirst({
      where: { id: body.accumulatorId, userId: auth.user.id },
      include: { matches: { include: { match: true } } },
    });
    if (!accumulator) {
      return NextResponse.json({ error: 'Accumulator not found' }, { status: 404 });
    }

    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.user.id, isActive: true },
    });
    if (keys.length === 0) {
      return NextResponse.json(
        { error: 'Configure al menos una API key en Settings' },
        { status: 400 }
      );
    }

    const keysByProvider: Partial<Record<AiProvider, string>> = {};
    for (const k of keys) {
      keysByProvider[k.provider] = decryptSecret(k.encryptedKey);
    }

    const summary = [
      `Total odds: ${accumulator.totalOdds}`,
      ...accumulator.matches.map(
        (m) =>
          `- ${m.match.homeTeam} vs ${m.match.awayTeam} (${m.match.league}) | ${m.betChoice ?? 'N/A'} @ ${m.odds ?? '?'}`
      ),
    ].join('\n');

    const result = await analyzeAccumulatorWithFallback(
      body.provider,
      keysByProvider,
      summary
    );

    const analysis = await prisma.analysis.create({
      data: {
        accumulatorId: accumulator.id,
        userId: auth.user.id,
        iaProvider: result.providerUsed,
        promptUsed: result.promptUsed,
        response: result.rawResponse,
        riskScore: new Prisma.Decimal(result.riskScore),
        evScore: new Prisma.Decimal(result.evScore),
        recommendedStake: new Prisma.Decimal(result.recommendedStake),
      },
    });

    await prisma.accumulator.update({
      where: { id: accumulator.id },
      data: { isAnalyzed: true },
    });

    await prisma.apiKey.updateMany({
      where: { userId: auth.user.id, provider: result.providerUsed },
      data: { lastUsed: new Date() },
    });

    return NextResponse.json({ analysis, result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}

/**
 * Lista análisis del usuario.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const analyses = await prisma.analysis.findMany({
    where: { userId: auth.user.id },
    include: { accumulator: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ analyses });
}
