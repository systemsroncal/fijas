/**
 * Motor fútbol ligero (Poisson) + edge/Kelly.
 * Patrones inspirados en penaltyblog / market scanners (sin deps NBA).
 */

export type MatchContext = {
  homeTeam: string;
  awayTeam: string;
  league: string;
  tip?: string | null;
  oddsHome?: number | null;
  oddsDraw?: number | null;
  oddsAway?: number | null;
  oddsOver?: number | null;
  oddsUnder?: number | null;
  /** Marcador en vivo / FT (TheSportsDB) para condicionar el Poisson */
  liveHomeScore?: number | null;
  liveAwayScore?: number | null;
  livePhase?: 'scheduled' | 'live' | 'finished' | 'unknown' | null;
  liveMinute?: number | null;
};

export type ModelProbs = {
  home: number;
  draw: number;
  away: number;
  over15: number;
  over25: number;
  bttsYes: number;
  lambdaHome: number;
  lambdaAway: number;
};

export type MarketEdge = {
  market: string;
  line: string | null;
  odds: number;
  modelProb: number;
  impliedProb: number;
  edge: number;
  kelly: number;
  verdict: 'value' | 'safe' | 'risky' | 'avoid' | 'neutral';
  source: 'model' | 'book' | 'implied';
};

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Poisson P(K=k) */
export function poissonPmf(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * Estima λ goles con tip scrapeado y cuotas (si hay).
 * Sin historial: baselines de liga + ajuste por tip/odds.
 */
export function estimateLambdas(ctx: MatchContext): { home: number; away: number } {
  let home = 1.35;
  let away = 1.15;

  const tip = (ctx.tip ?? '').toLowerCase();
  if (tip === '1' || tip.includes('home') || tip.includes('local')) {
    home += 0.35;
    away -= 0.15;
  } else if (tip === '2' || tip.includes('away') || tip.includes('visit')) {
    away += 0.35;
    home -= 0.15;
  } else if (tip === 'x' || tip.includes('draw') || tip.includes('empate')) {
    home -= 0.1;
    away -= 0.1;
  }

  if (ctx.oddsHome && ctx.oddsHome > 1) {
    const ih = 1 / ctx.oddsHome;
    home = Math.max(0.4, home * (0.7 + ih));
  }
  if (ctx.oddsAway && ctx.oddsAway > 1) {
    const ia = 1 / ctx.oddsAway;
    away = Math.max(0.4, away * (0.7 + ia));
  }

  return { home: clamp(home, 0.4, 3.2), away: clamp(away, 0.4, 3.2) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Fracción de partido restante según fase/minuto (para Poisson condicionado).
 */
function remainingFraction(ctx: MatchContext): number {
  if (ctx.livePhase === 'finished') return 0;
  if (ctx.liveMinute != null && ctx.liveMinute >= 0) {
    return clamp(1 - ctx.liveMinute / 95, 0.02, 1);
  }
  if (ctx.livePhase === 'live') return 0.45;
  return 1;
}

/**
 * Distribución 1X2 y mercados derivados vía rejilla Poisson 0..8.
 * Si hay marcador live/FT, condiciona: final = actual + goles restantes.
 */
export function predictMatch(ctx: MatchContext): ModelProbs {
  const { home: lhBase, away: laBase } = estimateLambdas(ctx);
  const ch = ctx.liveHomeScore;
  const ca = ctx.liveAwayScore;
  const hasLive =
    ch != null &&
    ca != null &&
    (ctx.livePhase === 'live' || ctx.livePhase === 'finished' || ch + ca > 0);

  const rem = hasLive ? remainingFraction(ctx) : 1;
  const lh = hasLive ? lhBase * rem : lhBase;
  const la = hasLive ? laBase * rem : laBase;

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let over15 = 0;
  let over25 = 0;
  let bttsYes = 0;

  if (hasLive && rem <= 0.02) {
    // Partido acabado (o casi): resultado fijado
    pHome = ch! > ca! ? 1 : 0;
    pDraw = ch! === ca! ? 1 : 0;
    pAway = ch! < ca! ? 1 : 0;
    over15 = ch! + ca! > 1.5 ? 1 : 0;
    over25 = ch! + ca! > 2.5 ? 1 : 0;
    bttsYes = ch! > 0 && ca! > 0 ? 1 : 0;
  } else {
    for (let hAdd = 0; hAdd <= 8; hAdd++) {
      for (let aAdd = 0; aAdd <= 8; aAdd++) {
        const p = poissonPmf(lh, hAdd) * poissonPmf(la, aAdd);
        const h = hasLive ? ch! + hAdd : hAdd;
        const a = hasLive ? ca! + aAdd : aAdd;
        if (h > a) pHome += p;
        else if (h === a) pDraw += p;
        else pAway += p;
        if (h + a > 1.5) over15 += p;
        if (h + a > 2.5) over25 += p;
        if (h > 0 && a > 0) bttsYes += p;
      }
    }
  }

  const sum = pHome + pDraw + pAway || 1;
  return {
    home: pHome / sum,
    draw: pDraw / sum,
    away: pAway / sum,
    over15,
    over25,
    bttsYes,
    lambdaHome: hasLive ? lhBase : lh,
    lambdaAway: hasLive ? laBase : la,
  };
}

/** Probabilidad implícita sin margen (simple 1/odds). */
export function impliedProb(odds: number): number {
  if (!odds || odds <= 1) return 0;
  return 1 / odds;
}

/**
 * Edge = modelProb - implied. Kelly fraccional (1/4) acotado.
 */
export function computeEdge(modelProb: number, odds: number): {
  edge: number;
  kelly: number;
  impliedProb: number;
} {
  const implied = impliedProb(odds);
  const edge = modelProb - implied;
  const b = odds - 1;
  const rawKelly = b > 0 ? (modelProb * odds - 1) / b : 0;
  const kelly = clamp(rawKelly * 0.25, 0, 0.15);
  return { edge, kelly, impliedProb: implied };
}

export function verdictFromEdge(
  edge: number,
  modelProb: number
): MarketEdge['verdict'] {
  if (edge >= 0.08 && modelProb >= 0.45) return 'value';
  if (edge >= 0.03 && modelProb >= 0.55) return 'safe';
  if (edge >= 0.05 && modelProb < 0.4) return 'risky';
  if (edge <= -0.05) return 'avoid';
  return 'neutral';
}

/**
 * Escanea mercados 1X2 / O/U / BTTS.
 * Si no hay cuota de casa, usa cuota implícita del modelo y la marca `implied` (no inventa casas).
 */
export function scanMatchEdges(ctx: MatchContext, probs: ModelProbs): MarketEdge[] {
  const impliedOdds = (p: number) =>
    Math.max(1.15, Math.round((1 / Math.max(p, 0.05)) * 100) / 100);

  const row = (
    market: string,
    line: string | null,
    bookOdds: number | null | undefined,
    modelProb: number
  ) => {
    const hasBook = bookOdds != null && bookOdds > 1;
    return {
      market,
      line,
      odds: hasBook ? Number(bookOdds) : impliedOdds(modelProb),
      modelProb,
      source: (hasBook ? 'book' : 'implied') as 'book' | 'implied',
    };
  };

  const rows = [
    row('1X2 Local', null, ctx.oddsHome, probs.home),
    row('1X2 Empate', null, ctx.oddsDraw, probs.draw),
    row('1X2 Visitante', null, ctx.oddsAway, probs.away),
    row('+1.5 goles', '1.5', ctx.oddsOver, probs.over15),
    row('+2.5 goles', '2.5', null, probs.over25),
    row('-2.5 goles', '2.5', ctx.oddsUnder, 1 - probs.over25),
    row('BTTS Sí', null, null, probs.bttsYes),
    row('BTTS No', null, null, 1 - probs.bttsYes),
    row('AH Local -0.5', '-0.5', null, probs.home),
    row('AH Visitante +0.5', '+0.5', null, 1 - probs.home),
  ];

  return rows.map((r) => {
    const { edge, kelly, impliedProb: imp } = computeEdge(r.modelProb, r.odds);
    return {
      market: r.market,
      line: r.line,
      odds: r.odds,
      modelProb: r.modelProb,
      impliedProb: imp,
      edge,
      kelly,
      verdict: verdictFromEdge(edge, r.modelProb),
      source: r.source,
    };
  });
}

/** Marcadores más probables (top N). */
export function topScorelines(
  lambdaHome: number,
  lambdaAway: number,
  n = 4
): Array<{ home: number; away: number; prob: number }> {
  const scores: Array<{ home: number; away: number; prob: number }> = [];
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      scores.push({
        home: h,
        away: a,
        prob: poissonPmf(lambdaHome, h) * poissonPmf(lambdaAway, a),
      });
    }
  }
  return scores.sort((a, b) => b.prob - a.prob).slice(0, n);
}

export function expectedCornersCards(probs: ModelProbs): {
  cornersHome: number | null;
  cornersAway: number | null;
  cardsHome: number | null;
  cardsAway: number | null;
  xgHome: number;
  xgAway: number;
} {
  // Solo xG del modelo Poisson (λ). Córners/tarjetas no se inventan sin historial real.
  return {
    xgHome: Math.round(probs.lambdaHome * 100) / 100,
    xgAway: Math.round(probs.lambdaAway * 100) / 100,
    cornersHome: null,
    cornersAway: null,
    cardsHome: null,
    cardsAway: null,
  };
}
