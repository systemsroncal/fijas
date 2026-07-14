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
  RelatedMatchRow,
  StructuredMatchPayload,
  TeamFormBlock,
} from '@/lib/ai/analysis-types';
import { buildAnalysisBrief, sanitizeNarrative } from '@/lib/ai/analysis-brief';
import {
  areMarketsCompatible,
  detectSport,
  formatReadablePick,
  isJunkMatch,
} from '@/lib/match-display';

export type {
  AnalysisMarket,
  AnalysisPick,
  ProposedAccumulator,
  StructuredMatchPayload,
} from '@/lib/ai/analysis-types';

export { buildAnalysisBrief, sanitizeNarrative } from '@/lib/ai/analysis-brief';

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function labelMarket(
  market: string,
  line: string | null | undefined,
  home: string,
  away: string
): string {
  return formatReadablePick(market, home, away, line);
}

function edgeToMarket(e: MarketEdge, home: string, away: string): AnalysisMarket {
  return {
    market: labelMarket(e.market, e.line, home, away),
    line: e.line,
    odds: e.odds,
    aiProb: pct(e.modelProb),
    edge: Math.round(e.edge * 1000) / 1000,
    verdict: e.verdict,
    source: e.source === 'book' ? 'book' : e.source === 'implied' ? 'implied' : 'model',
  };
}

function pickFromEdge(e: MarketEdge, home: string, away: string, rationale: string): AnalysisPick {
  return {
    market: labelMarket(e.market, e.line, home, away),
    odds: e.odds,
    aiProb: pct(e.modelProb),
    rationale,
  };
}

function legFromEdge(
  e: MarketEdge,
  ctx: MatchContext & { id?: string },
  label: string
) {
  const market = labelMarket(e.market, e.line, ctx.homeTeam, ctx.awayTeam);
  return {
    matchId: ctx.id,
    matchLabel: label,
    market,
    betChoice: market,
    odds: e.odds,
  };
}

/**
 * Huecos: varias selecciones compatibles del mismo partido (SGP / same-game).
 */
function buildSameMatchGapAccumulators(
  edges: MarketEdge[],
  ctx: MatchContext & { id?: string },
  label: string
): ProposedAccumulator[] {
  const candidates = edges
    .filter(
      (e) =>
        e.verdict === 'value' ||
        e.verdict === 'safe' ||
        (e.edge >= 0.02 && e.modelProb >= 0.42)
    )
    .sort((a, b) => b.edge - a.edge)
    .slice(0, 8);

  const out: ProposedAccumulator[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (!areMarketsCompatible(a.market, b.market)) continue;
      const key = [a.market, b.market].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const legs = [legFromEdge(a, ctx, label), legFromEdge(b, ctx, label)];
      const totalOdds = Math.round(legs.reduce((acc, l) => acc * l.odds, 1) * 1000) / 1000;
      const tier =
        a.verdict === 'safe' && b.verdict === 'safe'
          ? 'safe'
          : a.verdict === 'risky' || b.verdict === 'risky'
            ? 'risky'
            : 'value';
      out.push({
        title: `Hueco mismo partido · ${label}`,
        riskTier: tier,
        totalOdds,
        legs,
      });
      if (out.length >= 3) break;
    }
    if (out.length >= 3) break;
  }

  // Triple hueco si hay 3 mercados mutuamente compatibles
  if (candidates.length >= 3) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        for (let k = j + 1; k < candidates.length; k++) {
          const trio = [candidates[i], candidates[j], candidates[k]];
          const ok =
            areMarketsCompatible(trio[0].market, trio[1].market) &&
            areMarketsCompatible(trio[0].market, trio[2].market) &&
            areMarketsCompatible(trio[1].market, trio[2].market);
          if (!ok) continue;
          const legs = trio.map((e) => legFromEdge(e, ctx, label));
          out.push({
            title: `Hueco triple · ${label}`,
            riskTier: 'risky',
            totalOdds: Math.round(legs.reduce((acc, l) => acc * l.odds, 1) * 1000) / 1000,
            legs,
          });
          return out.slice(0, 4);
        }
      }
    }
  }

  return out.slice(0, 4);
}

export function emptyForm(message?: string): TeamFormBlock {
  return {
    available: false,
    message:
      message ??
      'Sin marcadores históricos en la base. No se inventan resultados de los últimos partidos.',
    recentScores: [],
    avgGoalsFor: null,
    avgGoalsAgainst: null,
    avgGoalsTotal: null,
    cardsTotal: null,
    avgCards: null,
    sampleSize: 0,
    rows: [],
  };
}

/**
 * Construye payload base con Poisson + scanner (sin LLM inventando props).
 */
export function buildModelPayload(
  ctx: MatchContext & { id?: string },
  mode: 'MATCH' | 'RANDOM' = 'MATCH',
  extras?: { form?: TeamFormBlock; relatedMatches?: RelatedMatchRow[] }
): StructuredMatchPayload {
  const probs = predictMatch(ctx);
  const edges = scanMatchEdges(ctx, probs);
  const scores = topScorelines(probs.lambdaHome, probs.lambdaAway, 4);
  const expectedRaw = expectedCornersCards(probs);
  const sport = detectSport(ctx.league);
  const form = extras?.form ?? emptyForm();

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
  const home = ctx.homeTeam;
  const away = ctx.awayTeam;
  const proposed: ProposedAccumulator[] = [];

  if (safe) {
    proposed.push({
      title: `Segura · ${label}`,
      riskTier: 'safe',
      totalOdds: safe.odds,
      legs: [legFromEdge(safe, ctx, label)],
    });
  }
  if (value && safe && value.market !== safe.market && areMarketsCompatible(safe.market, value.market)) {
    proposed.push({
      title: `Value mismo partido · ${label}`,
      riskTier: 'value',
      totalOdds: Math.round(safe.odds * value.odds * 1000) / 1000,
      legs: [legFromEdge(safe, ctx, label), legFromEdge(value, ctx, label)],
    });
  }
  if (risky) {
    proposed.push({
      title: `Arriesgada · ${label}`,
      riskTier: 'risky',
      totalOdds: risky.odds,
      legs: [legFromEdge(risky, ctx, label)],
    });
  }

  // Más huecos multi-mercado del mismo encuentro
  for (const gap of buildSameMatchGapAccumulators(edges, ctx, label)) {
    const sig = gap.legs.map((l) => l.market).sort().join('|');
    if (proposed.some((p) => p.legs.map((l) => l.market).sort().join('|') === sig)) continue;
    proposed.push(gap);
  }

  const bookCount = edges.filter((e) => e.source === 'book').length;
  const confidence = Math.round(
    clamp(
      45 +
        bookCount * 4 +
        (value ? 10 : 0) +
        (safe ? 8 : 0) +
        Math.max(...edges.map((e) => e.edge), 0) * 30,
      35,
      88
    )
  );

  const bestEdge = [...edges].sort((a, b) => b.edge - a.edge)[0];

  const payload: StructuredMatchPayload = {
    mode,
    match: {
      id: ctx.id,
      homeTeam: ctx.homeTeam,
      awayTeam: ctx.awayTeam,
      league: ctx.league,
      tip: ctx.tip ?? null,
      sport,
      homeCrestUrl: null,
      awayCrestUrl: null,
    },
    probs: {
      home: pct(probs.home),
      draw: pct(probs.draw),
      away: pct(probs.away),
    },
    scoreline: {
      mostLikely: `${scores[0].home}-${scores[0].away}`,
      alternatives: scores.slice(1).map((s) => `${s.home}-${s.away}`),
      source: 'model',
    },
    expected: {
      xgHome: expectedRaw.xgHome,
      xgAway: expectedRaw.xgAway,
      cornersHome: null,
      cornersAway: null,
      cardsHome: form.avgCards,
      cardsAway: null,
      note: form.available
        ? 'xG del modelo Poisson; medias de goles/tarjetas solo con historial scrapeado.'
        : 'xG del modelo Poisson. Sin córners/tarjetas inventados.',
    },
    form,
    relatedMatches: extras?.relatedMatches ?? [],
    markets: edges.map((e) => edgeToMarket(e, home, away)),
    picks: {
      value: value
        ? pickFromEdge(value, home, away, 'Edge positivo vs cuota (casa o implícita del modelo).')
        : null,
      safe: safe
        ? pickFromEdge(safe, home, away, 'Alta probabilidad modelo con edge no negativo.')
        : null,
      risky: risky ? pickFromEdge(risky, home, away, 'Cuota alta; mayor varianza.') : null,
      avoid: avoid
        ? pickFromEdge(avoid, home, away, 'Probabilidad modelo por debajo de la implícita.')
        : null,
    },
    proposedAccumulators: proposed,
    confidence,
    edgeSummary: `Mejor edge: ${
      bestEdge ? labelMarket(bestEdge.market, bestEdge.line, home, away) : 'N/A'
    }. Cuotas de casa: ${bookCount}/${edges.length}. λ ${probs.lambdaHome.toFixed(2)}-${probs.lambdaAway.toFixed(2)}.`,
    disclaimer:
      'Solo datos scrapeados + modelo Poisson. No se inventan marcadores, tiros ni props de jugador. Cuotas sin casa = implícitas del modelo.',
    model: probs,
  };
  payload.brief = buildAnalysisBrief(payload);
  return payload;
}

function extractJson(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No se pudo parsear JSON de la IA');
  return JSON.parse(match[0]);
}

/**
 * LLM solo narra el edge; no añade mercados/props inventados.
 */
export async function enrichPayloadWithLlm(
  preferred: AiProvider,
  keysByProvider: Partial<Record<AiProvider, string>>,
  base: StructuredMatchPayload
): Promise<{
  payload: StructuredMatchPayload;
  raw: string;
  providerUsed: AiProvider;
  promptUsed: string;
}> {
  const prompt = `Eres analista de apuestas. NO inventes mercados, jugadores, cuotas ni estadísticas.
Solo responde JSON: {"edgeText":"comentario corto basado SOLO en los datos dados","confidenceDelta":0}
Si faltan datos, dilo. Prohibido inventar.

Datos:
${JSON.stringify({
    match: base.match,
    probs: base.probs,
    scoreline: base.scoreline,
    form: base.form,
    markets: base.markets.slice(0, 10),
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
        {
          role: 'system',
          content: 'JSON válido únicamente. Cero invención de datos.',
        },
        { role: 'user', content: prompt },
      ]);
      const data = extractJson(raw) as { edgeText?: string; confidenceDelta?: number };
      const cleaned = sanitizeNarrative(data.edgeText, base.edgeSummary);
      const next: StructuredMatchPayload = {
        ...base,
        edgeSummary: cleaned,
        confidence: clamp(base.confidence + Number(data.confidenceDelta ?? 0), 35, 90),
        disclaimer: base.disclaimer,
      };
      next.brief = buildAnalysisBrief(next);
      return {
        payload: next,
        raw,
        providerUsed: provider,
        promptUsed: prompt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastError && Object.keys(keysByProvider).length === 0) throw lastError;
  return {
    payload: base,
    raw: JSON.stringify(base),
    providerUsed: preferred,
    promptUsed: prompt,
  };
}

/**
 * Scanner aleatorio sobre partidos reales (filtra basura Time/Match).
 */
export function buildRandomScannerPayload(
  matches: Array<MatchContext & { id?: string }>
): StructuredMatchPayload {
  const clean = matches.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam));
  if (clean.length === 0) {
    const empty = buildModelPayload(
      { homeTeam: 'N/A', awayTeam: 'N/A', league: 'N/A' },
      'RANDOM'
    );
    return {
      ...empty,
      edgeSummary: 'No hay partidos válidos (se filtraron cabeceras/basura del scraper).',
      relatedMatches: [],
      proposedAccumulators: [],
      markets: [],
    };
  }

  const scored = clean.map((m) => {
    const payload = buildModelPayload(m, 'RANDOM');
    const bestEdge = Math.max(...payload.markets.map((x) => x.edge), -1);
    return { payload, bestEdge, match: m };
  });
  scored.sort((a, b) => b.bestEdge - a.bestEdge);
  const top = scored.slice(0, 8);

  const relatedMatches: RelatedMatchRow[] = top.map((t) => ({
    id: t.match.id ?? '',
    homeTeam: t.match.homeTeam,
    awayTeam: t.match.awayTeam,
    league: t.match.league,
    tip: t.match.tip ?? null,
  }));

  const safeLegs = top
    .map((t) => ({ pick: t.payload.picks.safe, m: t.match }))
    .filter((x) => x.pick)
    .slice(0, 3);
  const valueLegs = top
    .map((t) => ({ pick: t.payload.picks.value, m: t.match }))
    .filter((x) => x.pick)
    .slice(0, 2);

  const proposed: ProposedAccumulator[] = [];
  if (safeLegs.length >= 2) {
    const legs = safeLegs.map((x) => ({
      matchId: x.m.id,
      matchLabel: `${x.m.homeTeam} vs ${x.m.awayTeam}`,
      market: x.pick!.market,
      betChoice: x.pick!.market,
      odds: x.pick!.odds,
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
        matchId: safeLegs[0].m.id,
        matchLabel: `${safeLegs[0].m.homeTeam} vs ${safeLegs[0].m.awayTeam}`,
        market: safeLegs[0].pick!.market,
        betChoice: safeLegs[0].pick!.market,
        odds: safeLegs[0].pick!.odds,
      },
      {
        matchId: valueLegs[0].m.id,
        matchLabel: `${valueLegs[0].m.homeTeam} vs ${valueLegs[0].m.awayTeam}`,
        market: valueLegs[0].pick!.market,
        betChoice: valueLegs[0].pick!.market,
        odds: valueLegs[0].pick!.odds,
      },
    ];
    proposed.push({
      title: 'Combinada value (huecos)',
      riskTier: 'value',
      totalOdds: Math.round(legs.reduce((a, l) => a * l.odds, 1) * 1000) / 1000,
      legs,
    });
  }

  const primary = {
    ...top[0].payload,
    mode: 'RANDOM' as const,
    relatedMatches,
    markets: top.flatMap((t) =>
      t.payload.markets
        .filter((m) => m.verdict === 'value' || m.verdict === 'safe')
        .slice(0, 2)
        .map((m) => ({
          ...m,
          market: `${t.match.homeTeam} vs ${t.match.awayTeam} · ${m.market}`,
        }))
    ),
    proposedAccumulators: [
      ...proposed,
      // Huecos same-match de los mejores partidos del scanner
      ...top.slice(0, 3).flatMap((t) =>
        t.payload.proposedAccumulators.filter(
          (a) => a.legs.length >= 2 && a.title.toLowerCase().includes('hueco')
        )
      ),
      ...top[0].payload.proposedAccumulators.filter((a) => a.legs.length === 1),
    ].slice(0, 8),
    edgeSummary: `Scanner sobre ${clean.length} partidos válidos. Mejor edge: ${top[0].bestEdge.toFixed(3)}.`,
    confidence: Math.round(
      top.reduce((a, t) => a + t.payload.confidence, 0) / Math.max(top.length, 1)
    ),
  };
  primary.brief = buildAnalysisBrief(primary);
  return primary;
}
