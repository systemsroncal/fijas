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
const TIME_ONLY = /^\d{1,2}:\d{2}(?::\d{2})?$/;

export function isJunkMatch(homeTeam: string, awayTeam: string): boolean {
  const h = homeTeam.trim();
  const a = awayTeam.trim();
  if (!h || !a) return true;
  if (h.length < 3 || a.length < 3) return true;
  if (TIME_ONLY.test(h) || TIME_ONLY.test(a)) return true;
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
 * Traduce 1 / X / 2 / 1X2 / dobles a texto entendible con nombres de equipos.
 * Ej: 1 → "España GANA", X → "EMPATE", 2 → "Francia GANA"
 */
export function formatReadablePick(
  pick: string | null | undefined,
  homeTeam?: string | null,
  awayTeam?: string | null,
  line?: string | null
): string {
  if (!pick?.trim()) return '—';
  const home = (homeTeam?.trim() || 'Local').trim();
  const away = (awayTeam?.trim() || 'Visitante').trim();
  const raw = `${pick} ${line ?? ''}`.trim();
  const t = raw.trim();
  const lower = t.toLowerCase();

  // Ya legible
  if (/^.+\s+gana$/i.test(t) || t.toUpperCase() === 'EMPATE') return t;
  if (/\bgana o empate\b|\bo\s+.+\s+gana\b/i.test(t)) return t;

  const tip = normalizeTip(t);
  if (tip === '1') return `${home} GANA`;
  if (tip === 'X') return 'EMPATE';
  if (tip === '2') return `${away} GANA`;

  // Mercados modelo 1X2 (antes de dobles: "1X2" contiene "X2")
  if (/^1x2\s*local\b/i.test(lower) || /^local\s*gana\b/i.test(lower)) {
    return `${home} GANA`;
  }
  if (/^1x2\s*visit/i.test(lower) || /^visitante\s*gana\b/i.test(lower)) {
    return `${away} GANA`;
  }
  if (/^1x2\s*empat/i.test(lower) || /^empate\b/i.test(lower) || /^draw\b/i.test(lower)) {
    return 'EMPATE';
  }

  // Doble oportunidad (formas compactas)
  const compact = t.replace(/\s/g, '');
  if (/^(1x|x1)$/i.test(compact)) return `${home} GANA O EMPATE`;
  if (/^(x2|2x)$/i.test(compact)) return `EMPATE O ${away} GANA`;
  if (/^(12|21)$/i.test(compact)) return `${home} O ${away} GANA`;

  // Hándicap / AH
  if (/\bah\s*local\b|h[aá]ndicap\s*local|home\s*win/i.test(lower)) {
    const ah = lower.match(/([+-]?\d+(?:[.,]\d+)?)/);
    return ah ? `${home} GANA (hándicap ${ah[1]})` : `${home} GANA`;
  }
  if (/\bah\s*visit|h[aá]ndicap\s*visit|away\s*win/i.test(lower)) {
    const ah = lower.match(/([+-]?\d+(?:[.,]\d+)?)/);
    return ah ? `${away} GANA (hándicap ${ah[1]})` : `${away} GANA`;
  }

  // Marcador exacto 2-1
  if (/^\d{1,2}\s*[-–:]\s*\d{1,2}$/.test(t)) {
    return `Marcador exacto ${t.replace(/[–:]/, '-')}`;
  }

  if (/btts\s*(s[ií]|yes)|ambos\s*marcan\s*s[ií]/i.test(lower)) return 'Ambos marcan: SÍ';
  if (/btts\s*(no|n)|ambos\s*marcan\s*no/i.test(lower)) return 'Ambos marcan: NO';

  return formatMarketLabel(pick, line);
}

/** Familia de mercado para compatibilidad en huecos same-match. */
export function marketFamily(market: string): string {
  const l = market.toLowerCase();
  if (/btts.*s[ií]|ambos\s*marcan:\s*s[ií]|btts\s*yes/i.test(l)) return 'btts_yes';
  if (/btts.*no|ambos\s*marcan:\s*no/i.test(l)) return 'btts_no';
  if (/\+|over|m[aá]s\s*de/i.test(l) && /gol/i.test(l)) return 'over';
  if (/-|under|menos\s*de/i.test(l) && /gol/i.test(l)) return 'under';
  if (/empat|draw/i.test(l) && !/gana o empate|o empate/i.test(l)) return 'draw';
  if (/visit|away/i.test(l) && /gana/i.test(l)) return 'away';
  if (/local|home/i.test(l) && /gana/i.test(l)) return 'home';
  if (/1x2\s*visit|ah\s*visit/i.test(l)) return 'away';
  if (/1x2\s*local|ah\s*local/i.test(l)) return 'home';
  if (/1x2\s*empat/i.test(l)) return 'draw';
  const tip = normalizeTip(market);
  if (tip === '1') return 'home';
  if (tip === 'X') return 'draw';
  if (tip === '2') return 'away';
  return `other:${l.slice(0, 24)}`;
}

/** True si dos mercados del mismo partido pueden ir juntos en una combinada (SGP). */
export function areMarketsCompatible(a: string, b: string): boolean {
  const fa = marketFamily(a);
  const fb = marketFamily(b);
  if (fa === fb) return false;
  const pair = [fa, fb].sort().join('|');
  const exclusive = new Set([
    'away|home',
    'draw|home',
    'away|draw',
    'over|under',
    'btts_no|btts_yes',
  ]);
  return !exclusive.has(pair);
}

/**
 * Prioriza resultado 1X2 / BTTS / O/U 2.5 sobre +1.5 (demasiado genérico).
 * Menor = mejor.
 */
export function marketPriority(market: string): number {
  const l = market.toLowerCase();
  if (/gana|empate|1x2|local|visitante|home|away|draw/.test(l) && !/hándicap|handicap|ah /.test(l)) {
    return 0;
  }
  if (/ambos marcan|btts/.test(l)) return 1;
  if (/2\.5/.test(l)) return 2;
  if (/hándicap|handicap|ah /.test(l)) return 3;
  if (/1\.5/.test(l)) return 5; // último: suele salir en casi todos los partidos
  return 4;
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
  | 'rugby'
  | 'cricket'
  | 'golf'
  | 'hockey'
  | 'baseball'
  | 'handball'
  | 'mma'
  | 'esports'
  | 'other';

export const SPORT_OPTIONS: Array<{ id: SportKind | ''; label: string }> = [
  { id: '', label: 'Todos los deportes' },
  { id: 'football', label: 'Fútbol' },
  { id: 'basketball', label: 'Baloncesto' },
  { id: 'tennis', label: 'Tenis' },
  { id: 'rugby', label: 'Rugby' },
  { id: 'cricket', label: 'Cricket' },
  { id: 'golf', label: 'Golf' },
  { id: 'hockey', label: 'Hockey' },
  { id: 'baseball', label: 'Béisbol' },
  { id: 'handball', label: 'Balonmano' },
  { id: 'volleyball', label: 'Vóley' },
  { id: 'american_football', label: 'Fútbol americano' },
  { id: 'mma', label: 'MMA / Boxeo' },
  { id: 'esports', label: 'Esports' },
  { id: 'other', label: 'Otros' },
];

/**
 * Infere deporte desde liga / texto (conservador: default fútbol).
 */
export function detectSport(league: string, note?: string | null): SportKind {
  const t = `${league} ${note ?? ''}`.toLowerCase();
  if (/\b(nba|ncaa|ncaab|basket|baloncesto|euroleague|eurocup|acb|bbl|nbl|cba)\b/.test(t)) {
    return 'basketball';
  }
  if (/\b(nfl|ncaa football|american football|futbol americano|ncaaf)\b/.test(t)) {
    return 'american_football';
  }
  if (/\b(volley|vôlei|voleibol|fivb)\b/.test(t)) return 'volleyball';
  if (/\b(atp|wta|tennis|tenis|itf|challenger)\b/.test(t)) return 'tennis';
  if (/\b(rugby|six nations|nrl|super rugby|top 14|premiership rugby|urc)\b/.test(t)) {
    return 'rugby';
  }
  if (/\b(cricket|ipl|t20|test match|odi|bbl cricket|psl)\b/.test(t)) return 'cricket';
  if (/\b(golf|pga|dp world|masters|ryder|european tour|liv golf)\b/.test(t)) return 'golf';
  if (/\b(nhl|hockey|nhl|khl|iihf|shl|liiga)\b/.test(t)) return 'hockey';
  if (/\b(mlb|baseball|npb|kbo|liga mexicana)\b/.test(t)) return 'baseball';
  if (/\b(handball|balonmano|ihf)\b/.test(t)) return 'handball';
  if (/\b(ufc|mma|boxing|boxeo|bellator|one championship)\b/.test(t)) return 'mma';
  if (/\b(esport|e-sport|lol|dota|csgo|cs2|valorant|league of legends)\b/.test(t)) {
    return 'esports';
  }
  // Prefijo explícito "Basketball: Liga"
  const prefix = t.split(/[:|/]/)[0]?.trim() ?? '';
  if (prefix === 'basketball' || prefix === 'baloncesto') return 'basketball';
  if (prefix === 'tennis' || prefix === 'tenis') return 'tennis';
  if (prefix === 'rugby') return 'rugby';
  if (prefix === 'cricket') return 'cricket';
  if (prefix === 'golf') return 'golf';
  if (prefix === 'hockey') return 'hockey';
  if (prefix === 'baseball' || prefix === 'beisbol' || prefix === 'béisbol') return 'baseball';
  if (prefix === 'handball' || prefix === 'balonmano') return 'handball';
  if (prefix === 'volleyball' || prefix === 'voley' || prefix === 'vóley') return 'volleyball';
  if (prefix === 'mma' || prefix === 'boxing' || prefix === 'boxeo') return 'mma';
  if (prefix === 'american_football' || prefix === 'nfl') return 'american_football';
  if (prefix === 'esports' || prefix === 'esport') return 'esports';
  if (prefix === 'football' || prefix === 'soccer' || prefix === 'futbol' || prefix === 'fútbol') {
    return 'football';
  }
  return 'football';
}

export function sportLabel(sport: SportKind): string {
  const map: Record<SportKind, string> = {
    football: 'Fútbol',
    american_football: 'Fútbol americano',
    basketball: 'Baloncesto',
    volleyball: 'Vóley',
    tennis: 'Tenis',
    rugby: 'Rugby',
    cricket: 'Cricket',
    golf: 'Golf',
    hockey: 'Hockey',
    baseball: 'Béisbol',
    handball: 'Balonmano',
    mma: 'MMA / Boxeo',
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

const TIME_CELL = /^(\d{1,2}:\d{2})(?::\d{2})?$/;

function splitVs(text: string): { home: string; away: string } | null {
  const normalized = text
    .replace(/\s+[vV][sS]\.?\s+/g, ' vs ')
    .replace(/\s+[vV]\s+/g, ' vs ');
  if (!/\svs\s/i.test(normalized)) return null;
  const parts = normalized.split(/\svs\s/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  if (TIME_CELL.test(parts[0]) || TIME_CELL.test(parts[1])) return null;
  return { home: parts[0], away: parts[1] };
}

/**
 * Corrige filas SaferTip: Local=hora, Visitante="A Vs B".
 */
export function repairMisparsedMatch(input: {
  homeTeam: string;
  awayTeam: string;
  kickoff?: string | null;
  league?: string;
}): { homeTeam: string; awayTeam: string; kickoff: string | null; repaired: boolean } {
  let home = input.homeTeam.trim();
  let away = input.awayTeam.trim();
  let kickoff = input.kickoff?.trim() || null;
  let repaired = false;

  // Caso 1: home es hora y away trae "A Vs B"
  if (TIME_CELL.test(home)) {
    const split = splitVs(away);
    if (split) {
      if (!kickoff) kickoff = home.match(TIME_CELL)?.[1] ?? home;
      home = split.home;
      away = split.away;
      repaired = true;
    }
  }

  // Caso 2: home contiene "vs" completo y away es basura/corto
  if (!repaired) {
    const splitHome = splitVs(home);
    if (splitHome && (away.length < 3 || TIME_CELL.test(away) || /^(tbd|n\/?a)$/i.test(away))) {
      home = splitHome.home;
      away = splitHome.away;
      repaired = true;
    }
  }

  // Caso 3: away contiene vs y home no parece equipo (muy corto o numérico)
  if (!repaired) {
    const splitAway = splitVs(away);
    if (splitAway && (TIME_CELL.test(home) || home.length < 3)) {
      if (TIME_CELL.test(home) && !kickoff) kickoff = home.match(TIME_CELL)?.[1] ?? home;
      home = splitAway.home;
      away = splitAway.away;
      repaired = true;
    }
  }

  return { homeTeam: home, awayTeam: away, kickoff, repaired };
}
