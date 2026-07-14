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
  marketFamily,
  marketPriority,
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

  const byQuality = (a: MarketEdge, b: MarketEdge) =>
    marketPriority(a.market) - marketPriority(b.market) ||
    b.edge - a.edge ||
    b.modelProb - a.modelProb;

  const value =
    edges.filter((e) => e.verdict === 'value').sort(byQuality)[0] ?? null;
  const safe =
    edges.filter((e) => e.verdict === 'safe').sort(byQuality)[0] ??
    edges.filter((e) => e.modelProb >= 0.52).sort(byQuality)[0] ??
    null;
  const risky =
    edges
      .filter((e) => e.verdict === 'risky' || (e.odds >= 2.2 && e.modelProb >= 0.22))
      .sort(byQuality)[0] ?? null;
  const avoid = edges.filter((e) => e.verdict === 'avoid').sort(byQuality)[0] ?? null;

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
  const bookEdges = edges.filter((e) => e.source === 'book');
  const bestBookEdge = Math.max(0, ...bookEdges.map((e) => e.edge), 0);
  const max1x2 = Math.max(probs.home, probs.draw, probs.away);
  const min1x2 = Math.min(probs.home, probs.draw, probs.away);
  const decisiveness = max1x2 - min1x2; // partidos equilibrados → menor confianza
  const bestPickProb = Math.max(
    value?.modelProb ?? 0,
    safe?.modelProb ?? 0,
    ...edges.map((e) => e.modelProb),
    0
  );
  // Antes: ~53 fijo (45+8) sin cuotas de casa. Ahora varía con 1X2, form y edge real.
  const confidence = Math.round(
    clamp(
      28 +
        max1x2 * 32 +
        decisiveness * 18 +
        bestPickProb * 12 +
        Math.min(bookCount, 5) * 4 +
        bestBookEdge * 35 +
        (form.available ? 8 : 0) +
        (ctx.tip ? 3 : 0) +
        (value ? 4 : 0),
      30,
      92
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
      'Análisis profundo: scraping + TheSportsDB (si hay match) + modelo Poisson. No se inventan marcadores, tiros ni props. Cuotas sin casa = implícitas del modelo.',
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
 * LLM de análisis profundo: debe tomarse el tiempo de razonar con scrape + TheSportsDB + Poisson.
 * No inventa mercados/props; solo interpreta datos entregados.
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
  const liveHint =
    base.accumulatorMeta?.liveContext?.length || base.sportsDb?.matchedEvent?.score
      ? '\nIMPORTANTE: hay marcador/estadísticas en vivo o FT. CONDICIONA el análisis a ese resultado actual (no ignores un 2-0 en curso).'
      : '';

  const prompt = `Eres un analista profesional de apuestas. Debes TOMARTE EL TIEMPO y analizar EN PROFUNDIDAD.

Obligatorio:
1) Cruza tip/cuotas scrapeadas + modelo Poisson + datos TheSportsDB (si existen).
2) Evalúa forma reciente, equilibrio 1X2, mercados value/safe/risky y riesgos.
3) No inventes jugadores, cuotas, marcadores ni estadísticas ausentes.
4) Si faltan datos TheSportsDB (API free limitada), dilo explícitamente y apoya en scraping+modelo.
5) Si hay liveContext o marcador FT, úsalo como prioridad sobre la predicción pre-partido.
6) Responde SOLO JSON válido:
{"edgeText":"<análisis profundo en español, 4-8 frases, estructurado>","confidenceDelta":<-5 a 8>,"depthNotes":"<qué datos usaste y cuáles faltaron>"}
${liveHint}

Datos (scrape + modelo + sportsdb + live):
${JSON.stringify({
    match: base.match,
    probs: base.probs,
    scoreline: base.scoreline,
    form: base.form,
    sportsDb: base.sportsDb ?? null,
    markets: base.markets.slice(0, 12),
    picks: base.picks,
    accumulatorMeta: base.accumulatorMeta ?? null,
    liveContext: base.accumulatorMeta?.liveContext ?? null,
    deepAnalysis: true,
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
          content:
            'Eres analista senior. Piensa con calma y profundidad. JSON válido únicamente. Cero invención de datos. Español claro. Si hay marcador en vivo, priorízalo.',
        },
        { role: 'user', content: prompt },
      ]);
      const data = extractJson(raw) as {
        edgeText?: string;
        confidenceDelta?: number;
        depthNotes?: string;
      };
      const cleaned = sanitizeNarrative(data.edgeText, base.edgeSummary);
      const depth =
        typeof data.depthNotes === 'string' && data.depthNotes.trim()
          ? ` | Profundidad: ${data.depthNotes.trim().slice(0, 280)}`
          : '';
      const next: StructuredMatchPayload = {
        ...base,
        deepAnalysis: true,
        edgeSummary: `${cleaned}${depth}`,
        confidence: clamp(base.confidence + Number(data.confidenceDelta ?? 0), 30, 92),
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
    payload: { ...base, deepAnalysis: true },
    raw: JSON.stringify(base),
    providerUsed: preferred,
    promptUsed: prompt,
  };
}


function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Scanner aleatorio: elige un partido al azar (no el primero de la lista)
 * entre candidatos no analizados previamente.
 */
export function buildRandomScannerPayload(
  matches: Array<MatchContext & { id?: string }>,
  opts?: { excludeMatchIds?: Iterable<string> }
): StructuredMatchPayload {
  const excluded = new Set(opts?.excludeMatchIds ?? []);
  const allClean = matches.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam));
  let clean = allClean.filter((m) => !m.id || !excluded.has(m.id));
  if (clean.length === 0) clean = allClean;

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

  const viable = scored.filter((s) => s.bestEdge >= -0.08);
  const pool = shuffleInPlace([...(viable.length >= 2 ? viable : scored)]);
  const primary = pool[0];
  const others = pool.slice(1, 9);

  const relatedMatches: RelatedMatchRow[] = others.map((t) => ({
    id: t.match.id ?? '',
    homeTeam: t.match.homeTeam,
    awayTeam: t.match.awayTeam,
    league: t.match.league,
    tip: t.match.tip ?? null,
  }));

  const comboPool = shuffleInPlace([...others, primary].filter(Boolean));

  /** Elige un mercado distinto por partido (evita repetir +1.5 en todas las piernas). */
  const pickDiverse = (
    t: (typeof scored)[0],
    usedFamilies: Set<string>
  ): { market: string; odds: number; aiProb: number } | null => {
    const candidates = [
      t.payload.picks.value,
      t.payload.picks.safe,
      t.payload.picks.risky,
      ...[...t.payload.markets]
        .filter((m) => m.verdict === 'value' || m.verdict === 'safe' || m.verdict === 'risky')
        .sort(
          (a, b) =>
            marketPriority(a.market) - marketPriority(b.market) || b.edge - a.edge
        ),
    ].filter(Boolean) as Array<{ market: string; odds: number; aiProb: number }>;

    for (const c of candidates) {
      const fam = marketFamily(c.market);
      // Evitar repetir la misma familia (sobre todo over 1.5) en la combinada
      if (usedFamilies.has(fam) && fam !== 'other') continue;
      usedFamilies.add(fam);
      return c;
    }
    // Fallback: mejor pick aunque repita familia
    const fallback = candidates[0];
    if (fallback) usedFamilies.add(marketFamily(fallback.market));
    return fallback ?? null;
  };

  const usedSafe = new Set<string>();
  const safeLegs = comboPool
    .map((t) => {
      const pick = pickDiverse(t, usedSafe);
      return pick ? { pick, m: t.match } : null;
    })
    .filter((x): x is { pick: { market: string; odds: number; aiProb: number }; m: MatchContext & { id?: string } } =>
      Boolean(x)
    )
    .slice(0, 3);

  const usedValue = new Set<string>();
  const valueLegs = shuffleInPlace([...comboPool])
    .map((t) => {
      const pick = pickDiverse(t, usedValue);
      return pick ? { pick, m: t.match } : null;
    })
    .filter((x): x is { pick: { market: string; odds: number; aiProb: number }; m: MatchContext & { id?: string } } =>
      Boolean(x)
    )
    .slice(0, 3);

  const proposed: ProposedAccumulator[] = [];
  if (safeLegs.length >= 2) {
    const legs = safeLegs.map((x) => ({
      matchId: x.m.id,
      matchLabel: `${x.m.homeTeam} vs ${x.m.awayTeam}`,
      market: x.pick.market,
      betChoice: x.pick.market,
      odds: x.pick.odds,
    }));
    proposed.push({
      title: 'Combinada segura (aleatoria)',
      riskTier: 'safe',
      totalOdds: Math.round(legs.reduce((a, l) => a * l.odds, 1) * 1000) / 1000,
      legs,
    });
  }
  if (valueLegs.length >= 2) {
    const legs = valueLegs.slice(0, 2).map((x) => ({
      matchId: x.m.id,
      matchLabel: `${x.m.homeTeam} vs ${x.m.awayTeam}`,
      market: x.pick.market,
      betChoice: x.pick.market,
      odds: x.pick.odds,
    }));
    // Solo si los mercados no son idénticos
    if (new Set(legs.map((l) => l.market.replace(/^.+·\s*/, ''))).size >= 1) {
      proposed.push({
        title: 'Combinada value (huecos aleatorios)',
        riskTier: 'value',
        totalOdds: Math.round(legs.reduce((acc, l) => acc * l.odds, 1) * 1000) / 1000,
        legs,
      });
    }
  }

  const sample = [primary, ...others];
  const result: StructuredMatchPayload = {
    ...primary.payload,
    mode: 'RANDOM',
    relatedMatches,
    markets: sample.flatMap((t) =>
      t.payload.markets
        .filter((m) => m.verdict === 'value' || m.verdict === 'safe' || m.verdict === 'risky')
        .slice(0, 2)
        .map((m) => ({
          ...m,
          market: `${t.match.homeTeam} vs ${t.match.awayTeam} · ${m.market}`,
        }))
    ),
    proposedAccumulators: [
      ...proposed,
      ...sample.slice(0, 3).flatMap((t) =>
        t.payload.proposedAccumulators.filter(
          (a) => a.legs.length >= 2 && a.title.toLowerCase().includes('hueco')
        )
      ),
      ...primary.payload.proposedAccumulators.filter((a) => a.legs.length >= 2).slice(0, 2),
    ].slice(0, 8),
    edgeSummary: `Aleatorio entre ${clean.length} partidos pendientes (excluidos ${excluded.size} ya analizados). Partido elegido: ${primary.match.homeTeam} vs ${primary.match.awayTeam}.`,
    confidence: primary.payload.confidence,
  };
  result.brief = buildAnalysisBrief(result);
  return result;
}

/**
 * Análisis estructurado de combinada: el modelo elige el pick de cada partido.
 */
export function buildAccumulatorStructuredPayload(
  matches: Array<MatchContext & { id?: string }>,
  name: string,
  extras?: {
    liveContext?: Array<{
      matchId?: string;
      label: string;
      score: string | null;
      phase: string;
      statusLabel?: string | null;
      note?: string;
    }>;
  }
): StructuredMatchPayload & {
  resolvedLegs: Array<{
    matchId?: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    market: string;
    odds: number;
    aiProb: number;
    liveScore?: string | null;
    livePhase?: string | null;
  }>;
} {
  const clean = matches.filter((m) => !isJunkMatch(m.homeTeam, m.awayTeam));
  if (clean.length === 0) {
    const empty = buildModelPayload(
      { homeTeam: 'N/A', awayTeam: 'N/A', league: 'N/A' },
      'MATCH'
    );
    return {
      ...empty,
      mode: 'ACCUMULATOR',
      edgeSummary: 'La combinada no tiene partidos válidos.',
      resolvedLegs: [],
      accumulatorMeta: { name, totalOdds: 1, resolvedLegs: [] },
    };
  }

  const usedFamilies = new Set<string>();
  const analyzed = clean.map((m) => {
    const payload = buildModelPayload(m, 'MATCH');
    const ranked = [
      payload.picks.value,
      payload.picks.safe,
      payload.picks.risky,
      ...[...payload.markets].sort(
        (a, b) => marketPriority(a.market) - marketPriority(b.market) || b.edge - a.edge
      ),
    ].filter(Boolean) as Array<{ market: string; odds: number; aiProb: number }>;

    let pick = ranked.find((c) => {
      const fam = marketFamily(c.market);
      if (usedFamilies.has(fam) && fam !== 'other') return false;
      return true;
    }) ?? ranked[0] ?? null;

    if (pick) usedFamilies.add(marketFamily(pick.market));
    return { m, payload, pick };
  });

  const resolvedLegs = analyzed.map(({ m, pick }) => {
    const liveScore =
      m.liveHomeScore != null && m.liveAwayScore != null
        ? `${m.liveHomeScore}-${m.liveAwayScore}`
        : null;
    return {
      matchId: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      league: m.league,
      market: pick && 'market' in pick ? pick.market : 'Sin pick',
      odds: pick && 'odds' in pick ? Number(pick.odds) : 1.5,
      aiProb: pick && 'aiProb' in pick ? Number(pick.aiProb) : 0,
      liveScore,
      livePhase: m.livePhase ?? null,
    };
  });

  const totalOdds =
    Math.round(resolvedLegs.reduce((acc, l) => acc * (l.odds > 1 ? l.odds : 1.5), 1) * 1000) /
    1000;

  const primary = analyzed[0];
  const relatedMatches: RelatedMatchRow[] = analyzed.slice(1).map(({ m }) => ({
    id: m.id ?? '',
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    league: m.league,
    tip: m.tip ?? null,
  }));

  const proposed: ProposedAccumulator[] = [
    {
      title: `Combinada · ${name}`,
      riskTier: 'value',
      totalOdds,
      legs: resolvedLegs.map((l) => ({
        matchId: l.matchId,
        matchLabel: `${l.homeTeam} vs ${l.awayTeam}`,
        market: l.market,
        betChoice: l.market,
        odds: l.odds,
      })),
    },
  ];

  for (const gap of primary.payload.proposedAccumulators.filter((a) => a.legs.length >= 2)) {
    proposed.push(gap);
  }

  const liveBits = (extras?.liveContext ?? [])
    .filter((l) => l.score || l.phase === 'live' || l.phase === 'finished')
    .map((l) => `${l.label} ${l.score ?? 's/m'} (${l.phase})`)
    .slice(0, 6);
  const liveNote = liveBits.length
    ? ` Contexto en vivo/FT: ${liveBits.join(' · ')}.`
    : '';

  const payload: StructuredMatchPayload = {
    ...primary.payload,
    mode: 'ACCUMULATOR',
    relatedMatches,
    markets: analyzed.flatMap(({ m, payload: p }) =>
      p.markets
        .filter((x) => x.verdict === 'value' || x.verdict === 'safe' || x.verdict === 'risky')
        .slice(0, 2)
        .map((x) => ({
          ...x,
          market: `${m.homeTeam} vs ${m.awayTeam} · ${x.market}`,
        }))
    ),
    proposedAccumulators: proposed.slice(0, 8),
    picks: {
      value: resolvedLegs[0]
        ? {
            market: resolvedLegs[0].market,
            odds: resolvedLegs[0].odds,
            aiProb: resolvedLegs[0].aiProb,
            rationale: resolvedLegs[0].liveScore
              ? `Pick con marcador actual ${resolvedLegs[0].liveScore}.`
              : 'Pick automático del modelo para la primera pierna.',
          }
        : null,
      safe: resolvedLegs[1]
        ? {
            market: resolvedLegs[1].market,
            odds: resolvedLegs[1].odds,
            aiProb: resolvedLegs[1].aiProb,
            rationale: resolvedLegs[1].liveScore
              ? `Pick con marcador actual ${resolvedLegs[1].liveScore}.`
              : 'Pick automático del modelo para la segunda pierna.',
          }
        : primary.payload.picks.safe,
      risky: primary.payload.picks.risky,
      avoid: primary.payload.picks.avoid,
    },
    edgeSummary: `Combinada «${name}» · ${resolvedLegs.length} partidos · cuota modelo @${totalOdds}. Poisson condicionado al marcador en vivo/FT cuando existe.${liveNote}`,
    confidence: Math.round(
      analyzed.reduce((a, x) => a + x.payload.confidence, 0) / Math.max(analyzed.length, 1)
    ),
    accumulatorMeta: {
      name,
      totalOdds,
      resolvedLegs: resolvedLegs.map((l) => ({
        matchId: l.matchId,
        matchLabel: `${l.homeTeam} vs ${l.awayTeam}`,
        market: l.market,
        odds: l.odds,
        aiProb: l.aiProb,
        liveScore: l.liveScore,
        livePhase: l.livePhase,
      })),
      liveContext: extras?.liveContext,
    },
  };
  payload.brief = buildAnalysisBrief(payload);
  return { ...payload, resolvedLegs };
}
