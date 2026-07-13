/**
 * Tipos y builders de análisis estructurado (partido / combinada / random).
 */

import { AiProvider } from '@prisma/client';
import {
  expectedCornersCards,
  MatchContext,
  MarketEdge,
  predictMatch,
  scanMatchEdges,
  topScorelines,
} from '@/lib/ai/football-model';
import { callProvider } from '@/lib/ai/providers';
import type {
  AnalysisMarket,
  AnalysisPick,
  ProposedAccumulator,
  StructuredMatchPayload,
} from '@/lib/ai/analysis-types';

export type {
  AnalysisMarket,
  AnalysisPick,
  ProposedAccumulator,
  StructuredMatchPayload,
} from '@/lib/ai/analysis-types';

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

function edgeToMarket(e: MarketEdge): AnalysisMarket {
  return {
    market: e.market,
    line: e.line,
    odds: e.odds,
    aiProb: pct(e.modelProb),
    edge: Math.round(e.edge * 1000) / 1000,
    verdict: e.verdict,
    source: 'model',
  };
}

function pickFromEdge(e: MarketEdge, rationale: string): AnalysisPick {
  return {
    market: e.market,
    odds: e.odds,
    aiProb: pct(e.modelProb),
    rationale,
  };
}

/**
 * Construye payload base con Poisson + scanner (sin LLM).
 */
export function buildModelPayload(
  ctx: MatchContext & { id?: string },
  mode: 'MATCH' | 'RANDOM' = 'MATCH'
): StructuredMatchPayload {
  const probs = predictMatch(ctx);
  const edges = scanMatchEdges(ctx, probs);
  const scores = topScorelines(probs.lambdaHome, probs.lambdaAway, 4);
  const expected = expectedCornersCards(probs);

  const value = edges.find((e) => e.verdict === 'value') ?? null;
  const safe =
    edges.find((e) => e.verdict === 'safe') ??
    edges.filter((e) => e.modelProb >= 0.55).sort((a, b) => b.edge - a.edge)[0] ??
    null;
  const risky =
    edges.find((e) => e.verdict === 'risky') ??
    edges.filter((e) => e.odds >= 2.2).sort((a, b) => b.edge - a.edge)[0] ??
    null;
  const avoid = edges.find((e) => e.verdict === 'avoid') ?? null;

  const label = `${ctx.homeTeam} vs ${ctx.awayTeam}`;
  const proposed: ProposedAccumulator[] = [];

  if (safe) {
    proposed.push({
      title: `Segura · ${label}`,
      riskTier: 'safe',
      totalOdds: safe.odds,
      legs: [
        {
          matchLabel: label,
          market: safe.market,
          betChoice: safe.market,
          odds: safe.odds,
        },
      ],
    });
  }
  if (value && safe && value.market !== safe.market) {
    const total = Math.round(safe.odds * value.odds * 1000) / 1000;
    proposed.push({
      title: `Value SGP · ${label}`,
      riskTier: 'value',
      totalOdds: total,
      legs: [
        {
          matchLabel: label,
          market: safe.market,
          betChoice: safe.market,
          odds: safe.odds,
        },
        {
          matchLabel: label,
          market: value.market,
          betChoice: value.market,
          odds: value.odds,
        },
      ],
    });
  }
  if (risky) {
    proposed.push({
      title: `Arriesgada · ${label}`,
      riskTier: 'risky',
      totalOdds: risky.odds,
      legs: [
        {
          matchLabel: label,
          market: risky.market,
          betChoice: risky.market,
          odds: risky.odds,
        },
      ],
    });
  }

  const confidence = Math.round(
    clamp(
      55 +
        (value ? 12 : 0) +
        (safe ? 10 : 0) +
        Math.max(...edges.map((e) => e.edge)) * 40,
      40,
      92
    )
  );

  return {
    mode,
    match: {
      id: ctx.id,
      homeTeam: ctx.homeTeam,
      awayTeam: ctx.awayTeam,
      league: ctx.league,
      tip: ctx.tip ?? null,
    },
    probs: {
      home: pct(probs.home),
      draw: pct(probs.draw),
      away: pct(probs.away),
    },
    scoreline: {
      mostLikely: `${scores[0].home}-${scores[0].away}`,
      alternatives: scores.slice(1).map((s) => `${s.home}-${s.away}`),
    },
    expected,
    markets: edges.map(edgeToMarket),
    picks: {
      value: value
        ? pickFromEdge(value, 'Hueco positivo vs cuota implícita (modelo Poisson).')
        : null,
      safe: safe
        ? pickFromEdge(safe, 'Alta probabilidad modelo con edge no negativo.')
        : null,
      risky: risky
        ? pickFromEdge(risky, 'Cuota atractiva; mayor varianza.')
        : null,
      avoid: avoid
        ? pickFromEdge(avoid, 'Probabilidad modelo claramente por debajo de la implícita.')
        : null,
    },
    proposedAccumulators: proposed,
    confidence,
    edgeSummary: `λ ${probs.lambdaHome.toFixed(2)}-${probs.lambdaAway.toFixed(2)}. Mejor edge: ${
      [...edges].sort((a, b) => b.edge - a.edge)[0]?.market ?? 'N/A'
    }.`,
    disclaimer:
      'Modelo Poisson + tips scrapeados. Mercados de props (tiros/jugador) pueden enriquecerse con IA y son estimados.',
    model: probs,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No se pudo parsear JSON de la IA');
  return JSON.parse(match[0]);
}

/**
 * Enriquece el payload con props LLM (tiros, tarjetas, goleador, etc.).
 */
export async function enrichPayloadWithLlm(
  preferred: AiProvider,
  keysByProvider: Partial<Record<AiProvider, string>>,
  base: StructuredMatchPayload
): Promise<{ payload: StructuredMatchPayload; raw: string; providerUsed: AiProvider; promptUsed: string }> {
  const prompt = `Eres analista de apuestas de fútbol. Dado este análisis base (Poisson), enriquece SOLO con JSON válido:
{
  "extraMarkets": [{"market":"string","line":"string|null","odds":number,"aiProb":number,"edge":number,"verdict":"value|safe|risky|avoid|neutral"}],
  "playerProps": [{"market":"string","odds":number,"aiProb":number,"rationale":"string"}],
  "shots": {"totalHome":number,"totalAway":number,"onTargetHome":number,"onTargetAway":number,"note":"string"},
  "edgeText": "string corto",
  "confidenceDelta": number
}
Incluye mercados de: córners, tarjetas, tiros totales/a puerta, handicap asiático, goleador/asistencia si es razonable.
No inventes cuotas absurdas (1.01-8.0). Marca props como estimados.

Base:
${JSON.stringify({
    match: base.match,
    probs: base.probs,
    scoreline: base.scoreline,
    expected: base.expected,
    topMarkets: base.markets.slice(0, 8),
  })}`;

  const order: AiProvider[] = [
    preferred,
    ...(Object.keys(keysByProvider).filter((p) => p !== preferred) as AiProvider[]),
  ];

  let lastError: Error | null = null;
  for (const provider of order) {
    const key = keysByProvider[provider];
    if (!key) continue;
    try {
      const raw = await callProvider(provider, key, [
        { role: 'system', content: 'Responde únicamente JSON válido sin markdown.' },
        { role: 'user', content: prompt },
      ]);
      const data = extractJson(raw) as {
        extraMarkets?: AnalysisMarket[];
        playerProps?: AnalysisPick[];
        shots?: StructuredMatchPayload extends never ? never : Record<string, unknown>;
        edgeText?: string;
        confidenceDelta?: number;
      };

      const extra = (data.extraMarkets ?? []).map((m) => ({
        ...m,
        source: 'estimated' as const,
        line: m.line ?? null,
        odds: Number(m.odds) || 1.8,
        aiProb: Number(m.aiProb) || 40,
        edge: Number(m.edge) || 0,
        verdict: m.verdict || 'neutral',
      }));

      const payload: StructuredMatchPayload = {
        ...base,
        markets: [...base.markets, ...extra],
        edgeSummary: data.edgeText || base.edgeSummary,
        confidence: clamp(base.confidence + Number(data.confidenceDelta ?? 0), 35, 95),
        disclaimer:
          'Híbrido: Poisson (modelo) + props LLM estimados. No es consejo financiero.',
      };

      if (data.playerProps?.[0] && !payload.picks.risky) {
        payload.picks.risky = {
          market: data.playerProps[0].market,
          odds: Number(data.playerProps[0].odds) || 3,
          aiProb: Number(data.playerProps[0].aiProb) || 30,
          rationale: data.playerProps[0].rationale || 'Prop estimado por IA',
        };
      }

      if (data.shots) {
        payload.edgeSummary += ` | Tiros est.: ${JSON.stringify(data.shots)}`;
      }

      return { payload, raw, providerUsed: provider, promptUsed: prompt };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // Sin LLM: devolver base
  if (lastError && Object.keys(keysByProvider).length === 0) {
    throw lastError;
  }
  return {
    payload: base,
    raw: JSON.stringify(base),
    providerUsed: preferred,
    promptUsed: prompt,
  };
}

/**
 * Scanner aleatorio: varios partidos → mejores huecos → combinadas propuestas.
 */
export function buildRandomScannerPayload(
  matches: Array<MatchContext & { id?: string }>
): StructuredMatchPayload {
  const scored = matches.map((m) => {
    const payload = buildModelPayload(m, 'RANDOM');
    const bestEdge = Math.max(...payload.markets.map((x) => x.edge), -1);
    return { payload, bestEdge, match: m };
  });
  scored.sort((a, b) => b.bestEdge - a.bestEdge);
  const top = scored.slice(0, 5);

  const safeLegs = top
    .map((t) => t.payload.picks.safe)
    .filter(Boolean)
    .slice(0, 3) as AnalysisPick[];
  const valueLegs = top
    .map((t) => t.payload.picks.value)
    .filter(Boolean)
    .slice(0, 2) as AnalysisPick[];

  const proposed: ProposedAccumulator[] = [];
  if (safeLegs.length >= 2) {
    const legs = safeLegs.map((p, i) => ({
      matchLabel: `${top[i].match.homeTeam} vs ${top[i].match.awayTeam}`,
      market: p.market,
      betChoice: p.market,
      odds: p.odds,
    }));
    proposed.push({
      title: 'Combinada segura (multi)',
      riskTier: 'safe',
      totalOdds: Math.round(legs.reduce((a, l) => a * l.odds, 1) * 1000) / 1000,
      legs,
    });
  }
  if (valueLegs.length >= 1 && safeLegs.length >= 1) {
    const legs = [
      {
        matchLabel: `${top[0].match.homeTeam} vs ${top[0].match.awayTeam}`,
        market: safeLegs[0].market,
        betChoice: safeLegs[0].market,
        odds: safeLegs[0].odds,
      },
      {
        matchLabel: `${top[1]?.match.homeTeam ?? top[0].match.homeTeam} vs ${top[1]?.match.awayTeam ?? top[0].match.awayTeam}`,
        market: valueLegs[0].market,
        betChoice: valueLegs[0].market,
        odds: valueLegs[0].odds,
      },
    ];
    proposed.push({
      title: 'Combinada value (huecos)',
      riskTier: 'value',
      totalOdds: Math.round(legs.reduce((a, l) => a * l.odds, 1) * 1000) / 1000,
      legs,
    });
  }

  const primary = top[0]?.payload;
  if (!primary) {
    return buildModelPayload(
      {
        homeTeam: 'N/A',
        awayTeam: 'N/A',
        league: 'N/A',
      },
      'RANDOM'
    );
  }

  return {
    ...primary,
    mode: 'RANDOM',
    markets: top.flatMap((t) =>
      t.payload.markets
        .filter((m) => m.verdict === 'value' || m.verdict === 'safe')
        .slice(0, 3)
        .map((m) => ({
          ...m,
          market: `${t.match.homeTeam} — ${m.market}`,
        }))
    ),
    proposedAccumulators: [...proposed, ...primary.proposedAccumulators],
    edgeSummary: `Scanner sobre ${matches.length} partidos. Top edge: ${top[0]?.bestEdge.toFixed(3)}.`,
    confidence: Math.round(
      top.reduce((a, t) => a + t.payload.confidence, 0) / Math.max(top.length, 1)
    ),
    disclaimer:
      'Scanner aleatorio híbrido (Poisson + tips). Props de jugador requieren enriquecimiento IA.',
  };
}
