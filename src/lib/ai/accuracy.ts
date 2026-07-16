/**
 * Evalúa aciertos de análisis vs marcador final real.
 */

import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import { extractScoreFromText, normalizeTip } from '@/lib/match-display';

export type HitStatus = 'hit' | 'miss' | 'push' | 'pending' | 'unknown';

export type EvaluatedPick = {
  label: string;
  market: string;
  status: HitStatus;
  reason: string;
};

export type AnalysisAccuracyRow = {
  analysisId: string;
  mode: string;
  createdAt: string;
  matchId: string | null;
  matchLabel: string;
  league: string;
  phase: string | null;
  score: string | null;
  provider: string;
  picks: EvaluatedPick[];
  /** hit rate de picks evaluables en este análisis (0-1) */
  hitRate: number | null;
  hits: number;
  misses: number;
  pending: boolean;
};

function parseScore(score: string | null | undefined): { home: number; away: number } | null {
  if (!score) return null;
  const m = String(score)
    .trim()
    .match(/^(\d{1,3})\s*[-–:]\s*(\d{1,3})$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

/**
 * Evalúa un mercado textual contra un marcador FT (fútbol / totales simples).
 */
export function evaluateMarketVsScore(
  market: string,
  home: number,
  away: number
): { status: HitStatus; reason: string } {
  const l = market.toLowerCase();
  const total = home + away;
  const tip = normalizeTip(market);

  // 1X2
  if (
    tip === '1' ||
    (/local|home|1x2\s*local/i.test(l) && /gana|win|1x2/i.test(l) && !/empat|o empate|ah |hándicap|handicap|-\d/i.test(l))
  ) {
    if (home > away) return { status: 'hit', reason: 'Local ganó' };
    return { status: 'miss', reason: 'Local no ganó' };
  }
  if (tip === 'X' || (/empat|draw|1x2\s*empat/i.test(l) && !/gana o empate/i.test(l))) {
    if (home === away) return { status: 'hit', reason: 'Empate' };
    return { status: 'miss', reason: 'No empataron' };
  }
  if (
    tip === '2' ||
    (/visit|away|1x2\s*visit/i.test(l) && /gana|win|1x2/i.test(l) && !/empat|ah |hándicap|handicap/i.test(l))
  ) {
    if (away > home) return { status: 'hit', reason: 'Visitante ganó' };
    return { status: 'miss', reason: 'Visitante no ganó' };
  }

  // BTTS
  if (/btts.*s[ií]|ambos\s*marcan:\s*s[ií]|ambos marcan.*sí/i.test(l)) {
    if (home > 0 && away > 0) return { status: 'hit', reason: 'Ambos marcaron' };
    return { status: 'miss', reason: 'No ambos marcaron' };
  }
  if (/btts.*no|ambos\s*marcan:\s*no/i.test(l)) {
    if (home === 0 || away === 0) return { status: 'hit', reason: 'No BTTS' };
    return { status: 'miss', reason: 'Sí hubo BTTS' };
  }

  // Over/Under goles
  const overM = l.match(/(?:\+|over|m[aá]s\s*de)\s*(\d+(?:\.\d+)?)/i) || l.match(/(\d+(?:\.\d+)?)\s*goles/);
  const underM = l.match(/(?:-|under|menos\s*de)\s*(\d+(?:\.\d+)?)/i);
  if (/\+|over|m[aá]s\s*de/i.test(l) && /gol/i.test(l) && overM) {
    const line = Number(overM[1]);
    if (total > line) return { status: 'hit', reason: `${total} > ${line}` };
    if (total === line) return { status: 'push', reason: `Push ${total}` };
    return { status: 'miss', reason: `${total} ≤ ${line}` };
  }
  if (/-|under|menos\s*de/i.test(l) && /gol/i.test(l) && underM) {
    const line = Number(underM[1]);
    if (total < line) return { status: 'hit', reason: `${total} < ${line}` };
    if (total === line) return { status: 'push', reason: `Push ${total}` };
    return { status: 'miss', reason: `${total} ≥ ${line}` };
  }
  // +2.5 goles style without "goles" word sometimes
  const plusLine = l.match(/^\+?\s*(\d+\.\d+)\s*goles/);
  if (plusLine) {
    const line = Number(plusLine[1]);
    if (total > line) return { status: 'hit', reason: `${total} > ${line}` };
    return { status: 'miss', reason: `${total} ≤ ${line}` };
  }

  // Mercados de stats (córners, remates, etc.) no verificables solo con marcador
  if (
    /c[oó]rner|remate|tiro|tackle|falta|tarjeta|offside|fuera de juego|ace|doble falta|break|rebote|asistencia|triple|turnover|bloqueo|saque/i.test(
      l
    )
  ) {
    return {
      status: 'unknown',
      reason: 'Mercado de stats: requiere box-score (no solo marcador)',
    };
  }

  return { status: 'unknown', reason: 'Mercado no evaluable automáticamente' };
}

function pickLabel(market: string, tier: string): string {
  return `${tier}: ${market}`;
}

/**
 * Extrae marcador FT de payload + campos del partido.
 */
export function resolveFinishedScore(input: {
  phase?: string | null;
  payload?: StructuredMatchPayload | null;
  statsNote?: string | null;
  kickoff?: string | null;
}): { score: string | null; finished: boolean } {
  const payload = input.payload;
  const fromDiag = payload?.matchDiagnostics?.score ?? null;
  const fromFd = payload?.footballData?.score ?? null;
  const fromSports =
    payload?.sportsDb?.matchedEvent?.score ?? null;
  const fromNote = extractScoreFromText(input.statsNote) ?? extractScoreFromText(input.kickoff);
  const score = fromDiag || fromFd || fromSports || fromNote || null;
  const finished =
    input.phase === 'finished' ||
    payload?.matchDiagnostics?.phase === 'finished' ||
    Boolean(score && (input.phase === 'finished' || fromDiag || fromFd));
  return { score, finished: finished || (input.phase === 'finished' && Boolean(score)) };
}

/**
 * Evalúa picks principales de un payload vs marcador.
 */
export function evaluateAnalysisPayload(
  payload: StructuredMatchPayload | null | undefined,
  scoreStr: string | null,
  finished: boolean
): EvaluatedPick[] {
  if (!finished || !scoreStr) {
    const pending: EvaluatedPick[] = [];
    if (payload?.picks?.value) {
      pending.push({
        label: pickLabel(payload.picks.value.market, 'Value'),
        market: payload.picks.value.market,
        status: 'pending',
        reason: 'Partido no finalizado o sin marcador',
      });
    }
    if (payload?.picks?.safe) {
      pending.push({
        label: pickLabel(payload.picks.safe.market, 'Safe'),
        market: payload.picks.safe.market,
        status: 'pending',
        reason: 'Partido no finalizado o sin marcador',
      });
    }
    return pending;
  }

  const parsed = parseScore(scoreStr);
  if (!parsed) {
    return [
      {
        label: 'Marcador',
        market: scoreStr,
        status: 'unknown',
        reason: 'No se pudo parsear marcador',
      },
    ];
  }

  const out: EvaluatedPick[] = [];
  const add = (tier: string, market: string) => {
    const ev = evaluateMarketVsScore(market, parsed.home, parsed.away);
    out.push({
      label: pickLabel(market, tier),
      market,
      status: ev.status,
      reason: ev.reason,
    });
  };

  if (payload?.picks?.value?.market) add('Value', payload.picks.value.market);
  if (payload?.picks?.safe?.market && payload.picks.safe.market !== payload.picks.value?.market) {
    add('Safe', payload.picks.safe.market);
  }
  if (payload?.match?.tip) {
    const tip = normalizeTip(payload.match.tip);
    if (tip === '1' || tip === 'X' || tip === '2') {
      const market =
        tip === '1' ? '1X2 Local' : tip === 'X' ? '1X2 Empate' : '1X2 Visitante';
      add('Tip scrapeado', market);
    }
  }

  // Top market por edge si no hay picks
  if (out.length === 0 && payload?.markets?.length) {
    const best = [...payload.markets].sort((a, b) => b.edge - a.edge)[0];
    if (best) add('Top edge', best.market);
  }

  return out;
}

export function summarizeHits(picks: EvaluatedPick[]): {
  hits: number;
  misses: number;
  pushes: number;
  pending: number;
  unknown: number;
  hitRate: number | null;
} {
  let hits = 0;
  let misses = 0;
  let pushes = 0;
  let pending = 0;
  let unknown = 0;
  for (const p of picks) {
    if (p.status === 'hit') hits++;
    else if (p.status === 'miss') misses++;
    else if (p.status === 'push') pushes++;
    else if (p.status === 'pending') pending++;
    else unknown++;
  }
  const decided = hits + misses;
  return {
    hits,
    misses,
    pushes,
    pending,
    unknown,
    hitRate: decided > 0 ? hits / decided : null,
  };
}
