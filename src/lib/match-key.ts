import crypto from 'crypto';

/**
 * Genera una clave estable para deduplicar partidos.
 */
export function buildMatchKey(
  matchDate: string | Date,
  homeTeam: string,
  awayTeam: string,
  league: string
): string {
  const date =
    typeof matchDate === 'string'
      ? matchDate.slice(0, 10)
      : matchDate.toISOString().slice(0, 10);
  const raw = `${date}|${normalizeTeam(homeTeam)}|${normalizeTeam(awayTeam)}|${normalizeTeam(league)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function normalizeTeam(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
