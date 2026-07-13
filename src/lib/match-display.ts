/**
 * Utilidades de presentación de partidos / tips scrapeados.
 */

const JUNK_TEAM =
  /^(time|match|date|good|bad|league|home|away|vs|tbd|n\/?a|local|visitante|-|—)$/i;

/**
 * Detecta filas basura del scraper (cabeceras de tabla parseadas como partidos).
 */
export function isJunkMatch(homeTeam: string, awayTeam: string): boolean {
  return JUNK_TEAM.test(homeTeam.trim()) || JUNK_TEAM.test(awayTeam.trim());
}

/**
 * Normaliza tip scrapeado a 1 | X | 2 cuando es posible.
 */
export function normalizeTip(betChoice: string | null | undefined): '1' | 'X' | '2' | null {
  if (!betChoice) return null;
  const t = betChoice.trim().toLowerCase();
  if (t === '1' || t === 'home' || t === 'h' || t === 'local' || t.startsWith('1 ')) return '1';
  if (t === 'x' || t === 'draw' || t === 'empate' || t === 'd') return 'X';
  if (t === '2' || t === 'away' || t === 'a' || t === 'visitante' || t.startsWith('2 ')) return '2';
  return null;
}

/**
 * Cuota usable para una columna 1/X/2, con fallbacks.
 */
export function resolveOdds(
  choice: '1' | 'X' | '2',
  p?: {
    oddsHome?: string | number | null;
    oddsDraw?: string | number | null;
    oddsAway?: string | number | null;
    odds?: string | number | null;
    betChoice?: string | null;
  } | null,
  fallback = 1.5
): number {
  if (!p) return fallback;
  const map = {
    '1': Number(p.oddsHome ?? 0),
    X: Number(p.oddsDraw ?? 0),
    '2': Number(p.oddsAway ?? 0),
  };
  if (map[choice] > 1) return map[choice];
  const tip = normalizeTip(p.betChoice);
  if (tip === choice && Number(p.odds ?? 0) > 1) return Number(p.odds);
  if (tip === choice) return fallback;
  return map[choice] > 0 ? map[choice] : fallback;
}

export function hasBookOdds(p?: {
  oddsHome?: string | number | null;
  oddsDraw?: string | number | null;
  oddsAway?: string | number | null;
} | null): boolean {
  if (!p) return false;
  return [p.oddsHome, p.oddsDraw, p.oddsAway].some((v) => Number(v ?? 0) > 1);
}
