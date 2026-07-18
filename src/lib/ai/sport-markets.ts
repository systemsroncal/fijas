/**
 * Mercados medibles por deporte (heurísticas del modelo, sin inventar cuotas de casa).
 * source = implied/estimated — el informe aclara que no son stats Opta reales.
 */

import type { MarketEdge, MatchContext, ModelProbs } from '@/lib/ai/football-model';
import { computeEdge, verdictFromEdge } from '@/lib/ai/football-model';
import type { SportKind } from '@/lib/match-display';

function impliedOdds(p: number): number {
  return Math.max(1.15, Math.round((1 / Math.max(p, 0.05)) * 100) / 100);
}

function row(
  market: string,
  line: string | null,
  modelProb: number
): Omit<MarketEdge, 'edge' | 'kelly' | 'impliedProb' | 'verdict'> {
  return {
    market,
    line,
    odds: impliedOdds(modelProb),
    modelProb,
    source: 'implied',
  };
}

function finalize(
  rows: Array<Omit<MarketEdge, 'edge' | 'kelly' | 'impliedProb' | 'verdict'>>
): MarketEdge[] {
  return rows.map((r) => {
    const { edge, kelly, impliedProb: imp } = computeEdge(r.modelProb, r.odds);
    return {
      ...r,
      impliedProb: imp,
      edge,
      kelly,
      verdict: verdictFromEdge(edge, r.modelProb),
    };
  });
}

function clamp01(n: number): number {
  return Math.min(0.92, Math.max(0.08, n));
}

/**
 * Mercados extra según deporte. Probabilidades derivadas de λ / tip (proxy estadístico).
 */
export function scanSportSpecificEdges(
  sport: SportKind,
  ctx: MatchContext,
  probs: ModelProbs
): MarketEdge[] {
  const intensity = (probs.lambdaHome + probs.lambdaAway) / 2.5; // ~1 típico

  if (sport === 'football' || sport === 'other') {
    const hs = ctx.teamStatsHome;
    const as = ctx.teamStatsAway;
    const hasReal = Boolean(hs?.source === 'rapidapi' || as?.source === 'rapidapi');

    const cardMult =
      ctx.refereeStyle === 'strict' ? 1.28 : ctx.refereeStyle === 'lenient' ? 0.78 : 1;
    const foulMult =
      ctx.refereeStyle === 'strict' ? 1.18 : ctx.refereeStyle === 'lenient' ? 0.88 : 1;
    const goalMult = ctx.absenceGoalMult ?? 1;

    const shotsTotalMean = hasReal && hs && as
      ? (hs.shotsTotal + as.shotsTotal) / 2
      : (22 + intensity * 6) * goalMult;
    const shotsOnMean = hasReal && hs && as
      ? (hs.shotsOnTarget + as.shotsOnTarget) / 2
      : (8 + intensity * 3) * goalMult;
    const cornersMean = hasReal && hs && as
      ? hs.corners + as.corners
      : (9 + intensity * 2.5) * goalMult;
    const cardsMean = hasReal && hs && as
      ? ((hs.cards + as.cards) / 2) * cardMult
      : (3.8 + (1 - Math.abs(probs.home - probs.away)) * 1.2) * cardMult;
    const foulsMean = hasReal && hs && as
      ? ((hs.fouls + as.fouls) / 2) * foulMult
      : (22 + intensity * 2) * foulMult;
    const offsidesMean = hasReal && hs && as
      ? (hs.offsides + as.offsides) / 2
      : 3.2 + intensity * 0.8;
    const tacklesMean = 28 + intensity * 3;
    const savesMean = 5.5 + intensity * 1.5;
    const throwInsMean = 18 + intensity * 2;

    const pOver = (mean: number, line: number) =>
      clamp01(0.5 + (mean - line) / (mean * 1.8));

    return finalize([
      row('Remates totales +22.5', '22.5', pOver(shotsTotalMean, 22.5)),
      row('Remates totales +25.5', '25.5', pOver(shotsTotalMean, 25.5)),
      row('Remates a puerta +8.5', '8.5', pOver(shotsOnMean, 8.5)),
      row('Remates a puerta +10.5', '10.5', pOver(shotsOnMean, 10.5)),
      row('Jugador más remates (local favorito)', null, clamp01(0.42 + probs.home * 0.2)),
      row('Córners totales +8.5', '8.5', pOver(cornersMean, 8.5)),
      row('Córners totales +9.5', '9.5', pOver(cornersMean, 9.5)),
      row('Córners totales +10.5', '10.5', pOver(cornersMean, 10.5)),
      row('Córners local +4.5', '4.5', pOver(cornersMean * (0.45 + probs.home * 0.25), 4.5)),
      row('Córners visitante +4.5', '4.5', pOver(cornersMean * (0.45 + probs.away * 0.25), 4.5)),
      row('Saques de banda +17.5', '17.5', pOver(throwInsMean, 17.5)),
      row('Atajadas porteros +5.5', '5.5', pOver(savesMean, 5.5)),
      row('Tackles +27.5', '27.5', pOver(tacklesMean, 27.5)),
      row('Faltas totales +21.5', '21.5', pOver(foulsMean, 21.5)),
      row('Faltas totales +24.5', '24.5', pOver(foulsMean, 24.5)),
      row('Tarjetas totales +3.5', '3.5', pOver(cardsMean, 3.5)),
      row('Tarjetas totales +4.5', '4.5', pOver(cardsMean, 4.5)),
      row('Tarjetas totales +5.5', '5.5', pOver(cardsMean, 5.5)),
      row('Fueras de juego +2.5', '2.5', pOver(offsidesMean, 2.5)),
      row('+0.5 goles', '0.5', clamp01(probs.over15 + 0.12)),
      row('+3.5 goles', '3.5', clamp01(probs.over25 * 0.55 * goalMult)),
      row('-1.5 goles', '1.5', clamp01(1 - probs.over15 * goalMult)),
    ]);
  }

  if (sport === 'tennis') {
    const aceMean = 8 + intensity * 2;
    const dfMean = 3.2;
    const firstServe = 0.62;
    const bpMean = 5.5;
    const ufeMean = 22;
    const winnersMean = 28;
    const gamesMean = 22;
    const pOver = (mean: number, line: number) =>
      clamp01(0.5 + (mean - line) / (mean * 1.6));

    return finalize([
      row('Ases (aces) +7.5', '7.5', pOver(aceMean, 7.5)),
      row('Ases (aces) +9.5', '9.5', pOver(aceMean, 9.5)),
      row('Dobles faltas +2.5', '2.5', pOver(dfMean, 2.5)),
      row('Dobles faltas +3.5', '3.5', pOver(dfMean, 3.5)),
      row('1er servicio +60%', '60', clamp01(firstServe)),
      row('Break points +4.5', '4.5', pOver(bpMean, 4.5)),
      row('Break points convertidos +2.5', '2.5', pOver(bpMean * 0.45, 2.5)),
      row('Errores no forzados +20.5', '20.5', pOver(ufeMean, 20.5)),
      row('Winners +25.5', '25.5', pOver(winnersMean, 25.5)),
      row('Total juegos +21.5', '21.5', pOver(gamesMean, 21.5)),
      row('Total juegos +22.5', '22.5', pOver(gamesMean, 22.5)),
      row('Partido a 3 sets', null, clamp01(0.38 + (1 - Math.abs(probs.home - probs.away)) * 0.15)),
      row('Local gana set 1', null, clamp01(probs.home * 0.95)),
    ]);
  }

  if (sport === 'volleyball') {
    const attackMean = 55;
    const blockMean = 8;
    const aceMean = 6;
    const serveErr = 7;
    const digs = 40;
    const pOver = (mean: number, line: number) =>
      clamp01(0.5 + (mean - line) / (mean * 1.5));

    return finalize([
      row('Puntos de ataque +52.5', '52.5', pOver(attackMean, 52.5)),
      row('Bloqueos ganadores +7.5', '7.5', pOver(blockMean, 7.5)),
      row('Ases de saque +5.5', '5.5', pOver(aceMean, 5.5)),
      row('Errores de saque +6.5', '6.5', pOver(serveErr, 6.5)),
      row('Defensas (digs) +38.5', '38.5', pOver(digs, 38.5)),
      row('Total puntos set 1 +45.5', '45.5', clamp01(0.52)),
      row('Partido a 5 sets', null, clamp01(0.28 + (1 - Math.abs(probs.home - probs.away)) * 0.2)),
      row('Local gana set 1', null, clamp01(probs.home)),
    ]);
  }

  if (sport === 'basketball') {
    const totalPts = 210 + intensity * 15;
    const reb = 82;
    const ast = 48;
    const threes = 24;
    const to = 28;
    const stl = 15;
    const blk = 9;
    const pOver = (mean: number, line: number) =>
      clamp01(0.5 + (mean - line) / (mean * 1.4));

    return finalize([
      row('Puntos totales +210.5', '210.5', pOver(totalPts, 210.5)),
      row('Puntos totales +220.5', '220.5', pOver(totalPts, 220.5)),
      row('Rebotes totales +80.5', '80.5', pOver(reb, 80.5)),
      row('Asistencias +46.5', '46.5', pOver(ast, 46.5)),
      row('Triples anotados +22.5', '22.5', pOver(threes, 22.5)),
      row('Triples anotados +24.5', '24.5', pOver(threes, 24.5)),
      row('FG% equipo local +45.5', '45.5', clamp01(0.48 + probs.home * 0.1)),
      row('Pérdidas (turnovers) +26.5', '26.5', pOver(to, 26.5)),
      row('Robos (steals) +14.5', '14.5', pOver(stl, 14.5)),
      row('Tapones (blocks) +8.5', '8.5', pOver(blk, 8.5)),
      row('Local -5.5 (spread)', '-5.5', clamp01(probs.home * 0.85)),
      row('1Q puntos +52.5', '52.5', pOver(totalPts / 4, 52.5)),
    ]);
  }

  // American football / hockey / etc. — subset genérico
  if (sport === 'american_football' || sport === 'hockey' || sport === 'handball') {
    return finalize([
      row('Total puntos/goles + línea media', null, clamp01(0.5 + intensity * 0.05)),
      row('Local gana', null, clamp01(probs.home)),
      row('Visitante gana', null, clamp01(probs.away)),
    ]);
  }

  void ctx;
  return [];
}
