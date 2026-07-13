import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, AnalysisMode, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { decryptSecret } from '@/lib/encryption';
import { analyzeAccumulatorWithFallback } from '@/lib/ai/providers';
import {
  buildModelPayload,
  buildRandomScannerPayload,
  emptyForm,
  enrichPayloadWithLlm,
  StructuredMatchPayload,
} from '@/lib/ai/structured-analysis';
import { MatchContext } from '@/lib/ai/football-model';
import {
  extractScoreFromText,
  isJunkMatch,
} from '@/lib/match-display';
import type { FormMatchRow, TeamFormBlock } from '@/lib/ai/analysis-types';

const schema = z
  .object({
    mode: z.enum(['MATCH', 'ACCUMULATOR', 'RANDOM']).default('ACCUMULATOR'),
    accumulatorId: z.string().optional(),
    suggestedId: z.string().optional(),
    matchId: z.string().optional(),
    provider: z.nativeEnum(AiProvider),
    enrich: z.boolean().optional().default(true),
  })
  .refine(
    (b) =>
      b.mode === 'RANDOM' ||
      Boolean(b.accumulatorId || b.suggestedId || b.matchId),
    { message: 'matchId, accumulatorId o suggestedId requerido (salvo RANDOM)' }
  );

type LegJson = {
  home?: string;
  away?: string;
  league?: string;
  betChoice?: string;
  odds?: number;
  label?: string;
};

function toCtx(m: {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  predictions?: Array<{
    betChoice?: string | null;
    oddsHome?: Prisma.Decimal | null;
    oddsDraw?: Prisma.Decimal | null;
    oddsAway?: Prisma.Decimal | null;
    oddsOver?: Prisma.Decimal | null;
    oddsUnder?: Prisma.Decimal | null;
    statsNote?: string | null;
  }>;
}): MatchContext & { id: string } {
  const p = m.predictions?.[0];
  return {
    id: m.id,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    league: m.league,
    tip: p?.betChoice,
    oddsHome: p?.oddsHome != null ? Number(p.oddsHome) : null,
    oddsDraw: p?.oddsDraw != null ? Number(p.oddsDraw) : null,
    oddsAway: p?.oddsAway != null ? Number(p.oddsAway) : null,
    oddsOver: p?.oddsOver != null ? Number(p.oddsOver) : null,
    oddsUnder: p?.oddsUnder != null ? Number(p.oddsUnder) : null,
  };
}

function scoresFromPayload(payload: StructuredMatchPayload) {
  const bestEdge = Math.max(...payload.markets.map((m) => m.edge), 0);
  return {
    riskScore: Math.round((10 - payload.confidence / 10) * 10) / 10,
    evScore: Math.round(bestEdge * 1000) / 1000,
    recommendedStake: Math.min(10, Math.max(1, Math.round(payload.confidence / 12))),
  };
}

/**
 * Forma reciente SOLO con marcadores reales extraídos de statsNote / historial BD.
 */
async function loadTeamForm(homeTeam: string, awayTeam: string): Promise<TeamFormBlock> {
  const history = await prisma.match.findMany({
    where: {
      OR: [
        { homeTeam },
        { awayTeam },
        { homeTeam: homeTeam },
        { awayTeam: awayTeam },
        { homeTeam: { equals: homeTeam } },
        { awayTeam: { equals: awayTeam } },
      ],
    },
    include: {
      predictions: { orderBy: { scrapedAt: 'desc' }, take: 2 },
    },
    orderBy: { matchDate: 'desc' },
    take: 40,
  });

  const rows: FormMatchRow[] = [];
  const goalSamples: number[] = [];
  let cardsTotal = 0;
  let cardsSamples = 0;

  for (const m of history) {
    if (isJunkMatch(m.homeTeam, m.awayTeam)) continue;
    const note = m.predictions.map((p) => p.statsNote).filter(Boolean).join(' ');
    const score = extractScoreFromText(note) ?? extractScoreFromText(m.kickoff);
    const tip = m.predictions[0]?.betChoice ?? null;
    rows.push({
      matchId: m.id,
      label: `${m.homeTeam} vs ${m.awayTeam}`,
      date: m.matchDate.toISOString().slice(0, 10),
      score,
      tip,
    });
    if (score) {
      const [a, b] = score.split('-').map(Number);
      if (!Number.isNaN(a) && !Number.isNaN(b)) goalSamples.push(a + b);
    }
    const cardMatch = note.match(/(\d+)\s*( tarjetas|cards)/i);
    if (cardMatch) {
      cardsTotal += Number(cardMatch[1]);
      cardsSamples += 1;
    }
  }

  const withScore = rows.filter((r) => r.score).slice(0, 10);
  if (withScore.length === 0) {
    return emptyForm(
      rows.length > 0
        ? `Hay ${rows.length} partidos registrados de estos equipos, pero sin marcador scrapeado. No se inventan resultados.`
        : undefined
    );
  }

  const avgGoalsTotal =
    goalSamples.length > 0
      ? Math.round((goalSamples.reduce((s, n) => s + n, 0) / goalSamples.length) * 100) / 100
      : null;

  return {
    available: true,
    message: `Historial real: ${withScore.length} marcadores scrapeados (máx. 10).`,
    recentScores: withScore.map((r) => r.score!).slice(0, 10),
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    avgGoalsTotal,
    cardsTotal: cardsSamples > 0 ? cardsTotal : null,
    avgCards:
      cardsSamples > 0 ? Math.round((cardsTotal / cardsSamples) * 100) / 100 : null,
    sampleSize: withScore.length,
    rows: withScore,
  };
}

/**
 * Analiza partido, combinada o scanner aleatorio.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = schema.parse(await request.json());

    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.user.id, isActive: true },
    });
    const keysByProvider: Partial<Record<AiProvider, string>> = {};
    for (const k of keys) {
      keysByProvider[k.provider] = decryptSecret(k.encryptedKey);
    }

    if (body.mode === 'MATCH') {
      if (!body.matchId) {
        return NextResponse.json({ error: 'matchId requerido' }, { status: 400 });
      }
      const match = await prisma.match.findUnique({
        where: { id: body.matchId },
        include: { predictions: { orderBy: { scrapedAt: 'desc' }, take: 3 } },
      });
      if (!match) {
        return NextResponse.json({ error: 'Partido no encontrado' }, { status: 404 });
      }
      if (isJunkMatch(match.homeTeam, match.awayTeam)) {
        return NextResponse.json(
          {
            error:
              'Este registro parece una cabecera de tabla (p.ej. Time vs Match), no un partido real. Ejecuta scrapers mejores o elige otro partido.',
          },
          { status: 400 }
        );
      }

      const form = await loadTeamForm(match.homeTeam, match.awayTeam);
      let payload = buildModelPayload(toCtx(match), 'MATCH', { form });
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'poisson-model';

      if (body.enrich && Object.keys(keysByProvider).length > 0) {
        const enriched = await enrichPayloadWithLlm(body.provider, keysByProvider, payload);
        payload = enriched.payload;
        raw = enriched.raw;
        providerUsed = enriched.providerUsed;
        promptUsed = enriched.promptUsed;
      }

      const scores = scoresFromPayload(payload);
      const analysis = await prisma.analysis.create({
        data: {
          mode: AnalysisMode.MATCH,
          matchId: match.id,
          userId: auth.user.id,
          iaProvider: providerUsed,
          promptUsed,
          response: raw,
          payload: payload as unknown as Prisma.InputJsonValue,
          riskScore: new Prisma.Decimal(scores.riskScore),
          evScore: new Prisma.Decimal(scores.evScore),
          recommendedStake: new Prisma.Decimal(scores.recommendedStake),
        },
        include: { match: true, accumulator: true },
      });

      if (keysByProvider[providerUsed]) {
        await prisma.apiKey.updateMany({
          where: { userId: auth.user.id, provider: providerUsed },
          data: { lastUsed: new Date() },
        });
      }

      return NextResponse.json({ analysis, payload });
    }

    if (body.mode === 'RANDOM') {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const matches = await prisma.match.findMany({
        where: { matchDate: { gte: dayStart, lt: dayEnd } },
        include: { predictions: { orderBy: { scrapedAt: 'desc' }, take: 1 } },
        take: 80,
      });
      const valid = matches.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam));
      if (valid.length === 0) {
        return NextResponse.json(
          {
            error:
              'No hay partidos válidos hoy (solo cabeceras/basura del scraper). Re-ejecuta scrapers de fuentes tip.',
          },
          { status: 400 }
        );
      }

      let payload = buildRandomScannerPayload(valid.map(toCtx));
      let raw = JSON.stringify(payload);
      let providerUsed: AiProvider = body.provider;
      let promptUsed = 'random-scanner-poisson';

      if (body.enrich && Object.keys(keysByProvider).length > 0) {
        const enriched = await enrichPayloadWithLlm(body.provider, keysByProvider, payload);
        payload = enriched.payload;
        raw = enriched.raw;
        providerUsed = enriched.providerUsed;
        promptUsed = enriched.promptUsed;
      }

      const scores = scoresFromPayload(payload);
      const analysis = await prisma.analysis.create({
        data: {
          mode: AnalysisMode.RANDOM,
          matchId: payload.match?.id && payload.match.id !== 'N/A' ? payload.match.id : null,
          userId: auth.user.id,
          iaProvider: providerUsed,
          promptUsed,
          response: raw,
          payload: payload as unknown as Prisma.InputJsonValue,
          riskScore: new Prisma.Decimal(scores.riskScore),
          evScore: new Prisma.Decimal(scores.evScore),
          recommendedStake: new Prisma.Decimal(scores.recommendedStake),
        },
        include: { match: true, accumulator: true },
      });

      return NextResponse.json({ analysis, payload });
    }

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
        },
        include: { matches: { include: { match: true } } },
      });

      for (const leg of legs.slice(0, 12)) {
        const home = String(leg.home ?? leg.label?.split(' vs ')[0] ?? 'TBD').trim();
        const away = String(leg.away ?? leg.label?.split(' vs ')[1] ?? 'TBD').trim();
        if (isJunkMatch(home, away)) continue;
        const league = String(leg.league ?? suggested.sourceSlug);
        const matchKey = `suggested|${suggested.id}|${home}|${away}|${league}`.slice(0, 190);

        const match = await prisma.match.upsert({
          where: { matchKey },
          create: {
            matchKey,
            matchDate: suggested.matchDate,
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

    if (Object.keys(keysByProvider).length === 0) {
      return NextResponse.json(
        { error: 'Configure al menos una API key en Settings' },
        { status: 400 }
      );
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
        mode: AnalysisMode.ACCUMULATOR,
        accumulatorId: accumulator.id,
        userId: auth.user.id,
        iaProvider: result.providerUsed,
        promptUsed: result.promptUsed,
        response: result.rawResponse,
        payload: {
          mode: 'ACCUMULATOR',
          summary,
          riskScore: result.riskScore,
          evScore: result.evScore,
          recommendedStake: result.recommendedStake,
        } as Prisma.InputJsonValue,
        riskScore: new Prisma.Decimal(result.riskScore),
        evScore: new Prisma.Decimal(result.evScore),
        recommendedStake: new Prisma.Decimal(result.recommendedStake),
      },
      include: { accumulator: true, match: true },
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

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const analyses = await prisma.analysis.findMany({
    where: { userId: auth.user.id },
    include: { accumulator: true, match: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ analyses });
}
