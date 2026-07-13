import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { decryptSecret } from '@/lib/encryption';
import { analyzeAccumulatorWithFallback } from '@/lib/ai/providers';

const schema = z
  .object({
    accumulatorId: z.string().optional(),
    suggestedId: z.string().optional(),
    provider: z.nativeEnum(AiProvider),
  })
  .refine((b) => Boolean(b.accumulatorId || b.suggestedId), {
    message: 'accumulatorId o suggestedId requerido',
  });

type LegJson = {
  home?: string;
  away?: string;
  league?: string;
  betChoice?: string;
  odds?: number;
  label?: string;
};

/**
 * Analiza una acumulada propia o una sugerida (crea combinada del usuario si hace falta).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = schema.parse(await request.json());

    let accumulator = body.accumulatorId
      ? await prisma.accumulator.findFirst({
          where: { id: body.accumulatorId, userId: auth.user.id },
          include: { matches: { include: { match: true } } },
        })
      : null;

    if (!accumulator && body.suggestedId) {
      const suggested = await prisma.suggestedAccumulator.findUnique({
        where: { id: body.suggestedId },
      });
      if (!suggested) {
        return NextResponse.json({ error: 'Combinada sugerida no encontrada' }, { status: 404 });
      }

      const legs = (Array.isArray(suggested.legsJson) ? suggested.legsJson : []) as LegJson[];
      const totalOdds = Number(suggested.totalOdds) || 1;

      accumulator = await prisma.accumulator.create({
        data: {
          userId: auth.user.id,
          name: suggested.title || `Sugerida ${suggested.sourceSlug}`,
          totalOdds: new Prisma.Decimal(totalOdds.toFixed(3)),
          matches: {
            create: [],
          },
        },
        include: { matches: { include: { match: true } } },
      });

      // Guardamos el resumen en un análisis posterior; las legs sugeridas no siempre
      // tienen matchId local. Creamos matches placeholder si hay equipos.
      for (const leg of legs.slice(0, 12)) {
        const home = String(leg.home ?? leg.label?.split(' vs ')[0] ?? 'TBD').trim();
        const away = String(leg.away ?? leg.label?.split(' vs ')[1] ?? 'TBD').trim();
        const league = String(leg.league ?? suggested.sourceSlug);
        const matchDate = suggested.matchDate;
        const matchKey = `suggested|${suggested.id}|${home}|${away}|${league}`.slice(0, 190);

        const match = await prisma.match.upsert({
          where: { matchKey },
          create: {
            matchKey,
            matchDate,
            league,
            homeTeam: home,
            awayTeam: away,
          },
          update: {},
        });

        await prisma.accumulatorMatch.create({
          data: {
            accumulatorId: accumulator.id,
            matchId: match.id,
            betType: '1X2',
            betChoice: String(leg.betChoice ?? 'N/A'),
            odds:
              leg.odds != null && Number(leg.odds) > 0
                ? new Prisma.Decimal(Number(leg.odds))
                : null,
          },
        });
      }

      accumulator = await prisma.accumulator.findFirstOrThrow({
        where: { id: accumulator.id },
        include: { matches: { include: { match: true } } },
      });
    }

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
      include: { accumulator: true },
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
