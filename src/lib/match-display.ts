/**
 * Utilidades de presentación de partidos / tips scrapeados.
 */

const JUNK_EXACT =
  /^(time|match|date|good|bad|league|home|away|vs|v|tbd|n\/?a|local|visitante|team|teams|score|result|fixture|event|status|odds|pick|tip|tips|prediction|pred|ft|ht|w|l|d|yes|no|over|under|total|player|players|corner|corners|card|cards|shot|shots|-|—|\.|…)$/i;

const JUNK_CONTAINS =
  /\b(select|column|header|table|row|cell|undefined|null)\b/i;

/**
 * Detecta filas basura del scraper (cabeceras de tabla parseadas como partidos).
 */
export function isJunkMatch(homeTeam: string, awayTeam: string): boolean {
  const h = homeTeam.trim();
  const a = awayTeam.trim();
  if (!h || !a) return true;
  if (h.length < 3 || a.length < 3) return true;
  if (JUNK_EXACT.test(h) || JUNK_EXACT.test(a)) return true;
  if (JUNK_CONTAINS.test(h) || JUNK_CONTAINS.test(a)) return true;
  // Ambos genéricos tipo Time/Match o Date/Score
  if (JUNK_EXACT.test(h.split(/\s+/)[0] ?? '') && JUNK_EXACT.test(a.split(/\s+/)[0] ?? '')) {
    return true;
  }
  return false;
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
 * Over → +línea · Under → -línea (ej. +1.5 goles, -2.5 goles).
 */
export function formatMarketLabel(market: string, line?: string | null): string {
  const raw = `${market} ${line ?? ''}`.trim();
  const m = raw.match(/\b(over|under|o|u|\+|-)[\s._]*(\d+(?:[.,]\d+)?)\b/i);
  if (m) {
    const side = m[1].toLowerCase();
    const n = m[2].replace(',', '.');
    const isOver = side === 'over' || side === 'o' || side === '+';
    const prefix = isOver ? '+' : '-';
    let unit = 'goles';
    const lower = raw.toLowerCase();
    if (lower.includes('corner') || lower.includes('córner')) unit = 'córners';
    else if (lower.includes('tarjeta') || lower.includes('card')) unit = 'tarjetas';
    else if (lower.includes('tiro') || lower.includes('shot')) unit = 'tiros';
    return `${prefix}${n} ${unit}`;
  }

  // Over 1.5 / Under 2.5 sin capturar arriba
  const ou = raw.match(/\b(over|under)\s*(\d+(?:[.,]\d+)?)/i);
  if (ou) {
    const n = ou[2].replace(',', '.');
    const prefix = ou[1].toLowerCase() === 'over' ? '+' : '-';
    return `${prefix}${n} goles`;
  }

  return market.replace(/\bOver\b/gi, '+').replace(/\bUnder\b/gi, '-');
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

export type SportKind =
  | 'football'
  | 'american_football'
  | 'basketball'
  | 'volleyball'
  | 'tennis'
  | 'esports'
  | 'other';

/**
 * Infere deporte desde liga / texto (conservador: default fútbol).
 */
export function detectSport(league: string, note?: string | null): SportKind {
  const t = `${league} ${note ?? ''}`.toLowerCase();
  if (/\b(nba|ncaa|basket|baloncesto|euroleague)\b/.test(t)) return 'basketball';
  if (/\b(nfl|ncaa football|american football|futbol americano)\b/.test(t)) {
    return 'american_football';
  }
  if (/\b(volley|vôlei|voleibol)\b/.test(t)) return 'volleyball';
  if (/\b(atp|wta|tennis|tenis)\b/.test(t)) return 'tennis';
  if (/\b(esport|e-sport|lol|dota|csgo|cs2|valorant)\b/.test(t)) return 'esports';
  return 'football';
}

export function sportLabel(sport: SportKind): string {
  const map: Record<SportKind, string> = {
    football: 'Fútbol',
    american_football: 'Fútbol americano',
    basketball: 'Baloncesto',
    volleyball: 'Vóley',
    tennis: 'Tenis',
    esports: 'Esports',
    other: 'Deporte',
  };
  return map[sport];
}

/** Iniciales para monograma si no hay escudo. */
export function teamMonogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Extrae marcador tipo 2-1 de un texto scrapeado (solo si existe).
 */
export function extractScoreFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\b(\d{1,2})\s*[-–:]\s*(\d{1,2})\b/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a > 20 || b > 20) return null;
  return `${a}-${b}`;
}
