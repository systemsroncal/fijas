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
  source: 'model';
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
 * Distribución 1X2 y mercados derivados vía rejilla Poisson 0..8.
 */
export function predictMatch(ctx: MatchContext): ModelProbs {
  const { home: lh, away: la } = estimateLambdas(ctx);
  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;
  let over15 = 0;
  let over25 = 0;
  let bttsYes = 0;

  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = poissonPmf(lh, h) * poissonPmf(la, a);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a > 1.5) over15 += p;
      if (h + a > 2.5) over25 += p;
      if (h > 0 && a > 0) bttsYes += p;
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
    lambdaHome: lh,
    lambdaAway: la,
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
 * Escanea mercados básicos 1X2 / O/U / BTTS con cuotas disponibles o sintéticas.
 */
export function scanMatchEdges(ctx: MatchContext, probs: ModelProbs): MarketEdge[] {
  const synth = (p: number) => Math.max(1.15, Math.round((1 / Math.max(p, 0.05)) * 100) / 100);
  const rows: Array<{ market: string; line: string | null; odds: number; modelProb: number }> = [
    {
      market: '1X2 Local',
      line: null,
      odds: ctx.oddsHome && ctx.oddsHome > 1 ? ctx.oddsHome : synth(probs.home),
      modelProb: probs.home,
    },
    {
      market: '1X2 Empate',
      line: null,
      odds: ctx.oddsDraw && ctx.oddsDraw > 1 ? ctx.oddsDraw : synth(probs.draw),
      modelProb: probs.draw,
    },
    {
      market: '1X2 Visitante',
      line: null,
      odds: ctx.oddsAway && ctx.oddsAway > 1 ? ctx.oddsAway : synth(probs.away),
      modelProb: probs.away,
    },
    {
      market: 'Over 1.5',
      line: '1.5',
      odds: ctx.oddsOver && ctx.oddsOver > 1 ? ctx.oddsOver : synth(probs.over15),
      modelProb: probs.over15,
    },
    {
      market: 'Over 2.5',
      line: '2.5',
      odds: synth(probs.over25),
      modelProb: probs.over25,
    },
    {
      market: 'Under 2.5',
      line: '2.5',
      odds: ctx.oddsUnder && ctx.oddsUnder > 1 ? ctx.oddsUnder : synth(1 - probs.over25),
      modelProb: 1 - probs.over25,
    },
    {
      market: 'BTTS Sí',
      line: null,
      odds: synth(probs.bttsYes),
      modelProb: probs.bttsYes,
    },
    {
      market: 'BTTS No',
      line: null,
      odds: synth(1 - probs.bttsYes),
      modelProb: 1 - probs.bttsYes,
    },
    {
      market: 'AH Local -0.5',
      line: '-0.5',
      odds: synth(probs.home),
      modelProb: probs.home,
    },
    {
      market: 'AH Visitante +0.5',
      line: '+0.5',
      odds: synth(1 - probs.home),
      modelProb: 1 - probs.home,
    },
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
      source: 'model' as const,
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
  cornersHome: number;
  cornersAway: number;
  cardsHome: number;
  cardsAway: number;
  xgHome: number;
  xgAway: number;
} {
  return {
    xgHome: Math.round(probs.lambdaHome * 100) / 100,
    xgAway: Math.round(probs.lambdaAway * 100) / 100,
    cornersHome: Math.round((4.8 + probs.lambdaHome * 0.7) * 10) / 10,
    cornersAway: Math.round((4.2 + probs.lambdaAway * 0.7) * 10) / 10,
    cardsHome: Math.round((2.1 + (1 - probs.home) * 0.8) * 10) / 10,
    cardsAway: Math.round((2.2 + (1 - probs.away) * 0.8) * 10) / 10,
  };
}
