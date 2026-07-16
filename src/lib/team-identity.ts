/**
 * Identidad de clubes/equipos: alias (FC Astana ≈ Astana), categoría
 * (principal / femenino / juveniles) y dedupe de historial de forma.
 */

import type { FormMatchRow } from '@/lib/ai/analysis-types';

export type TeamCategory =
  | 'senior_men'
  | 'senior_women'
  | 'youth'
  | 'reserve'
  | 'unknown';

const CLUB_NOISE =
  /\b(fc|cf|sc|ac|afc|fk|nk|sk|bk|ik|if|sv|as|ssc|rcd|rc|cd|ud|sd|ca|club|atletico|atlético|the|de|do|da|del|la|el|los|las)\b/gi;

const WOMEN_RE =
  /\b(women|womens|woman|femenin[oa]s?|femenil|ladies|dames|damen|feminine|wsl|nwsl|\(w\)|\(f\)|\[w\]|\[f\])\b|(^|[\s/\-])W(?=$|[\s/\-])/i;

const YOUTH_RE =
  /\b(u-?1[5-9]|u-?2[0-3]|sub[-\s]?1[5-9]|sub[-\s]?2[0-3]|youth|juvenil(es)?|junior|juniors|academy|academia|cadete|infantil|under[-\s]?(1[5-9]|2[0-3]))\b/i;

const RESERVE_RE =
  /\b(reserve|reserves|reserva|reservas|ii\b|2nd|segunda|amateur|amateure|b\s*team|team\s*b|\sB$)/i;

export function foldText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Quita prefijos/sufijos de club sin tocar el núcleo del nombre. */
export function stripClubNoise(name: string): string {
  let s = foldText(name);
  // repetir por si hay "fc fc astana"
  for (let i = 0; i < 3; i++) {
    const next = s.replace(CLUB_NOISE, ' ').replace(/\s+/g, ' ').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

export function detectTeamCategory(
  name: string,
  league?: string | null
): TeamCategory {
  const blob = `${name} ${league ?? ''}`;
  if (WOMEN_RE.test(blob)) return 'senior_women';
  if (YOUTH_RE.test(blob)) return 'youth';
  if (RESERVE_RE.test(blob)) return 'reserve';
  // Liga explícita femenina / juvenil
  const lg = foldText(league ?? '');
  if (/\bfemen|\bwomen|\bladies|\bwsl\b/.test(lg)) return 'senior_women';
  if (/\byouth|\bjuvenil|\bu19|\bu21|\bu23|\bacademy\b/.test(lg)) return 'youth';
  if (!name.trim()) return 'unknown';
  return 'senior_men';
}

/** Categoría del partido analizado (usa liga si el nombre no tipifica). */
export function detectMatchCategory(
  homeTeam: string,
  awayTeam: string,
  league?: string | null
): TeamCategory {
  const h = detectTeamCategory(homeTeam, league);
  const a = detectTeamCategory(awayTeam, league);
  if (h === a) return h;
  // Si un lado tipifica y el otro es "senior_men" genérico, gana el tipificado
  if (h !== 'senior_men' && h !== 'unknown') return h;
  if (a !== 'senior_men' && a !== 'unknown') return a;
  const fromLeague = detectTeamCategory('', league);
  if (fromLeague !== 'senior_men' && fromLeague !== 'unknown') return fromLeague;
  return 'senior_men';
}

export function categoriesCompatible(
  target: TeamCategory,
  candidate: TeamCategory
): boolean {
  if (target === 'unknown' || candidate === 'unknown') {
    // unknown solo choca con women/youth/reserve tipificados
    if (target === 'senior_men' && (candidate === 'senior_women' || candidate === 'youth' || candidate === 'reserve')) {
      return false;
    }
    if (candidate === 'senior_men' && (target === 'senior_women' || target === 'youth' || target === 'reserve')) {
      return false;
    }
    return true;
  }
  return target === candidate;
}

/**
 * ¿Mismo club pese a alias de plataforma? (Astana ≈ FC Astana, Dinamo ≈ Dinamo City)
 * Evita cruces tipo Real Madrid vs Real Sociedad.
 */
export function sameTeamIdentity(a: string, b: string): boolean {
  const ca = stripClubNoise(a);
  const cb = stripClubNoise(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;

  const ta = ca.split(' ').filter((t) => t.length > 1);
  const tb = cb.split(' ').filter((t) => t.length > 1);
  if (!ta.length || !tb.length) return false;

  const shorter = ta.length <= tb.length ? ta : tb;
  const longer = ta.length <= tb.length ? tb : ta;

  // Todos los tokens del nombre corto están en el largo
  const subset = shorter.every((t) => longer.includes(t));
  if (!subset) return false;

  // Debe haber un núcleo distintivo (>=4) compartido
  const core = shorter.find((t) => t.length >= 4) ?? shorter[0];
  if (!core || core.length < 3) return false;
  if (!longer.includes(core)) return false;

  // Si ambos tienen 2+ tokens y difieren en el segundo distintivo → otro club
  // (real madrid vs real sociedad)
  if (ta.length >= 2 && tb.length >= 2) {
    const a2 = ta.find((t) => t !== ta[0] && t.length >= 4);
    const b2 = tb.find((t) => t !== tb[0] && t.length >= 4);
    if (a2 && b2 && a2 !== b2 && !longer.includes(a2)) return false;
    if (a2 && b2 && a2 !== b2 && ta[0] === tb[0] && a2 !== b2) return false;
  }

  return true;
}

/** Variantes para ampliar búsqueda en BD (contains). */
export function teamNameSearchVariants(name: string): string[] {
  const raw = name.trim();
  const stripped = stripClubNoise(raw);
  const titled = stripped
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
  return Array.from(
    new Set(
      [raw, stripped, titled, `FC ${titled}`, `${titled} FC`, `CF ${titled}`]
        .map((s) => s.trim())
        .filter((s) => s.length >= 3)
    )
  ).slice(0, 8);
}

/** Marcadores absurdos para fútbol 11 (suele ser otra categoría / basura scrape). */
export function isOutlierFootballScore(score: string | null | undefined): boolean {
  if (!score) return false;
  const m = String(score).trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  const total = a + b;
  const max = Math.max(a, b);
  // 18-0, 12-1, etc.
  return max >= 12 || total >= 15;
}

function parseLabelTeams(label: string): { home: string; away: string } | null {
  const parts = label.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  return { home: parts[0].trim(), away: parts[1].trim() };
}

function dateDistanceDays(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T12:00:00Z`);
  const db = Date.parse(`${b.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 999;
  return Math.abs(da - db) / (24 * 60 * 60 * 1000);
}

function pairKey(home: string, away: string): string {
  const x = stripClubNoise(home);
  const y = stripClubNoise(away);
  return [x, y].sort().join('|');
}

function rowQuality(row: FormMatchRow): number {
  let q = 0;
  q += (row.label?.length ?? 0) * 0.1;
  if (row.score && !isOutlierFootballScore(row.score)) q += 20;
  if (row.score && isOutlierFootballScore(row.score)) q -= 40;
  if (row.tip) q += 2;
  // Prefiere nombres con prefijo de club (más específicos) sin ser basura
  if (/\b(fc|cf|afc)\b/i.test(row.label)) q += 3;
  return q;
}

/**
 * Filtra filas a la misma categoría del partido analizado y al club correcto.
 */
export function filterRowsSameCategory(
  rows: FormMatchRow[],
  homeTeam: string,
  awayTeam: string,
  league?: string | null
): FormMatchRow[] {
  const target = detectMatchCategory(homeTeam, awayTeam, league);
  return rows.filter((row) => {
    const teams = parseLabelTeams(row.label);
    if (!teams) return false;
    const cat = detectMatchCategory(teams.home, teams.away, league);
    if (!categoriesCompatible(target, cat)) return false;
    if (isOutlierFootballScore(row.score) && target === 'senior_men') return false;

    const involvesHome =
      sameTeamIdentity(homeTeam, teams.home) || sameTeamIdentity(homeTeam, teams.away);
    const involvesAway =
      sameTeamIdentity(awayTeam, teams.home) || sameTeamIdentity(awayTeam, teams.away);
    // Historial de forma: al menos uno de los dos equipos del análisis
    return involvesHome || involvesAway;
  });
}

/**
 * Dedup: mismo par de clubes en ventana de fechas (p.ej. Astana-Aktobe 12/13 jul).
 * Conserva la fila de mayor calidad.
 */
export function dedupeFormRows(
  rows: FormMatchRow[],
  opts?: { dateWindowDays?: number }
): FormMatchRow[] {
  const windowDays = opts?.dateWindowDays ?? 2;
  const sorted = [...rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const kept: FormMatchRow[] = [];

  for (const row of sorted) {
    const teams = parseLabelTeams(row.label);
    if (!teams) {
      kept.push(row);
      continue;
    }
    const key = pairKey(teams.home, teams.away);
    const dupIdx = kept.findIndex((k) => {
      const kt = parseLabelTeams(k.label);
      if (!kt) return false;
      if (pairKey(kt.home, kt.away) !== key) return false;
      return dateDistanceDays(k.date || '', row.date || '') <= windowDays;
    });

    if (dupIdx < 0) {
      kept.push(row);
      continue;
    }

    // Mismo fixture cercano: quedarse con el mejor
    if (rowQuality(row) > rowQuality(kept[dupIdx])) {
      kept[dupIdx] = row;
    }
  }

  return kept;
}

/** Pipeline completo para historial de análisis. */
export function sanitizeFormRows(
  rows: FormMatchRow[],
  homeTeam: string,
  awayTeam: string,
  league?: string | null
): FormMatchRow[] {
  const filtered = filterRowsSameCategory(rows, homeTeam, awayTeam, league);
  return dedupeFormRows(filtered, { dateWindowDays: 2 });
}

/** ¿El partido scrapeado involucra al equipo? (alias-aware). */
export function matchInvolvesTeam(
  team: string,
  rowHome: string,
  rowAway: string
): boolean {
  return sameTeamIdentity(team, rowHome) || sameTeamIdentity(team, rowAway);
}

export function isH2HPair(
  homeTeam: string,
  awayTeam: string,
  rowHome: string,
  rowAway: string
): boolean {
  return (
    matchInvolvesTeam(homeTeam, rowHome, rowAway) &&
    matchInvolvesTeam(awayTeam, rowHome, rowAway)
  );
}
