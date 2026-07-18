/**
 * Motor fútbol ligero (Poisson) + edge/Kelly.
 * Patrones inspirados en penaltyblog / market scanners (sin deps NBA).
 */

import type { TeamRecentFormStats, TeamRollingStats, LiveMarketQuote } from '@/lib/ai/analysis-types';
import {
  adjustLambdasFromTeamStats,
  leagueLambdaBaselines,
} from '@/lib/ai/league-baselines';

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
  /** Fecha del partido analizado (YYYY-MM-DD) */
  matchDateYmd?: string | null;
  /** Perfil arbitral para proxies de tarjetas/faltas */
  refereeStyle?: 'strict' | 'lenient' | 'balanced' | 'unknown';
  /** Multiplicador de goles por bajas (1 = sin impacto) */
  absenceGoalMult?: number;
  /** Forma reciente local (prioridad sobre H2H) */
  formHome?: TeamRecentFormStats | null;
  /** Forma reciente visitante */
  formAway?: TeamRecentFormStats | null;
  /** Cantidad de H2H en muestra (peso bajo en λ) */
  h2hCount?: number;
  /** Stats rolling reales (RapidAPI) — reemplaza proxies cuando existen */
  teamStatsHome?: TeamRollingStats | null;
  teamStatsAway?: TeamRollingStats | null;
  /** Cuotas live agregadas (RapidAPI + scrape) */
  liveOdds?: LiveMarketQuote[];
  oddsSource?: 'scrape' | 'rapidapi' | 'mixed';
  /** Probabilidades 1X2 externas (0–1), p. ej. Football Prediction API */
  externalProb1x2?: { home: number; draw: number; away: number } | null;
};

export type Implied1x2 = { home: number; draw: number; away: number };

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
 * Probabilidades 1X2 implícitas normalizadas desde cuotas de casa.
 */
export function implied1x2FromCtx(ctx: MatchContext): Implied1x2 | null {
  if (!ctx.oddsHome || !ctx.oddsAway || ctx.oddsHome <= 1 || ctx.oddsAway <= 1) {
    return null;
  }
  const ih = 1 / ctx.oddsHome;
  const ia = 1 / ctx.oddsAway;
  const id =
    ctx.oddsDraw && ctx.oddsDraw > 1 ? 1 / ctx.oddsDraw : Math.max(0.08, (ih + ia) * 0.32);
  const sum = ih + ia + id;
  return { home: ih / sum, draw: id / sum, away: ia / sum };
}

/**
 * Mezcla Poisson + mercado (cuotas). Prioriza casas cuando hay cuota completa.
 */
export function blend1x2WithMarket(
  pois: Pick<ModelProbs, 'home' | 'draw' | 'away'>,
  ctx: MatchContext,
  marketWeight = 0.62
): Pick<ModelProbs, 'home' | 'draw' | 'away'> {
  const mkt = implied1x2FromCtx(ctx);
  const ext = ctx.externalProb1x2;
  let home = pois.home;
  let draw = pois.draw;
  let away = pois.away;

  if (mkt) {
    const w = marketWeight;
    home = home * (1 - w) + mkt.home * w;
    draw = draw * (1 - w) + mkt.draw * w;
    away = away * (1 - w) + mkt.away * w;
  }

  if (ext && ext.home > 0 && ext.away > 0) {
    const w = mkt ? 0.28 : 0.4;
    home = home * (1 - w) + ext.home * w;
    draw = draw * (1 - w) + (ext.draw ?? 0.28) * w;
    away = away * (1 - w) + ext.away * w;
  }

  const sum = home + draw + away || 1;
  return { home: home / sum, draw: draw / sum, away: away / sum };
}

/**
 * Estima λ goles: forma reciente + cuotas (mercado) + tip leve si no contradice cuotas.
 */
export function estimateLambdas(ctx: MatchContext): { home: number; away: number } {
  const hasForm =
    ctx.formHome &&
    ctx.formAway &&
    ctx.formHome.sampleSize >= 3 &&
    ctx.formAway.sampleSize >= 3;

  let home = 1.12;
  let away = 1.12;

  if (hasForm) {
    const hf = ctx.formHome!;
    const af = ctx.formAway!;
    // Ataque propio + defensa rival (proxy Dixon-Coles lite)
    home = (hf.avgGoalsFor + af.avgGoalsAgainst) / 2;
    away = (af.avgGoalsFor + hf.avgGoalsAgainst) / 2;

    const formDiff = af.winRate - hf.winRate;
    if (formDiff > 0.2) {
      home *= 0.88;
      away *= 1.12;
    } else if (formDiff < -0.2) {
      home *= 1.08;
      away *= 0.9;
    } else if (Math.abs(formDiff) <= 0.08) {
      home *= 1.03; // ventaja local mínima si formas muy parejas
    }
  } else {
    const leagueBase = leagueLambdaBaselines(ctx.league);
    home = leagueBase.home;
    away = leagueBase.away;
  }

  const adjusted = adjustLambdasFromTeamStats(
    home,
    away,
    ctx.teamStatsHome,
    ctx.teamStatsAway
  );
  home = adjusted.home;
  away = adjusted.away;

  const mktEarly = implied1x2FromCtx(ctx);
  // Cuotas de casa (señal fuerte del mercado → λ)
  if (ctx.oddsHome && ctx.oddsAway && ctx.oddsHome > 1 && ctx.oddsAway > 1) {
    const ih = 1 / ctx.oddsHome;
    const ia = 1 / ctx.oddsAway;
    const id = ctx.oddsDraw && ctx.oddsDraw > 1 ? 1 / ctx.oddsDraw : 0.28;
    const norm = ih + ia + id;
    const pH = ih / norm;
    const pA = ia / norm;
    const oddsLh = 0.65 + pH * 2.4;
    const oddsLa = 0.65 + pA * 2.4;
    home = home * 0.45 + oddsLh * 0.55;
    away = away * 0.45 + oddsLa * 0.55;
  } else if (ctx.oddsHome && ctx.oddsHome > 1) {
    home = Math.max(0.35, home * (0.75 + 1 / ctx.oddsHome));
  } else if (ctx.oddsAway && ctx.oddsAway > 1) {
    away = Math.max(0.35, away * (0.75 + 1 / ctx.oddsAway));
  }

  const tip = (ctx.tip ?? '').toLowerCase();
  const tipHome = tip === '1' || tip.includes('home') || tip.includes('local');
  const tipAway = tip === '2' || tip.includes('away') || tip.includes('visit');
  const tipDraw = tip === 'x' || tip.includes('draw') || tip.includes('empate');
  const marketFavorsAway = mktEarly != null && mktEarly.away > mktEarly.home + 0.08;
  const marketFavorsHome = mktEarly != null && mktEarly.home > mktEarly.away + 0.08;

  if (tipHome && !marketFavorsAway) {
    home += 0.04;
    away -= 0.03;
  } else if (tipAway && !marketFavorsHome) {
    away += 0.04;
    home -= 0.03;
  } else if (tipDraw) {
    home -= 0.03;
    away -= 0.03;
  }

  // H2H: peso mínimo (solo si hay 2+ encuentros)
  if ((ctx.h2hCount ?? 0) >= 2 && hasForm) {
    // Sin datos H2H detallados aquí: no mover λ más de ~3%
    void ctx.h2hCount;
  }

  return { home: clamp(home, 0.25, 3.2), away: clamp(away, 0.25, 3.2) };
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
/**
 * Poisson puro (sin mezclar cuotas de mercado en 1X2).
 */
export function predictPoissonOnly(ctx: MatchContext): ModelProbs {
  return buildPoissonProbs(ctx);
}

function buildPoissonProbs(ctx: MatchContext): ModelProbs {
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
  const poisRaw = {
    home: pHome / sum,
    draw: pDraw / sum,
    away: pAway / sum,
    over15,
    over25,
    bttsYes,
    lambdaHome: hasLive ? lhBase : lh,
    lambdaAway: hasLive ? laBase : la,
  };

  return poisRaw;
}

/** Poisson + mezcla 1X2 con cuotas de casa cuando existen. */
export function predictMatch(ctx: MatchContext): ModelProbs {
  const poisRaw = buildPoissonProbs(ctx);
  const ch = ctx.liveHomeScore;
  const ca = ctx.liveAwayScore;
  const hasLive =
    ch != null &&
    ca != null &&
    (ctx.livePhase === 'live' || ctx.livePhase === 'finished' || ch + ca > 0);
  const rem = hasLive ? remainingFraction(ctx) : 1;
  if (hasLive && rem <= 0.02) return poisRaw;
  const blended = blend1x2WithMarket(poisRaw, ctx);
  return { ...poisRaw, ...blended };
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
