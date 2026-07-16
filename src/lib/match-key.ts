import crypto from 'crypto';
import { stripClubNoise } from '@/lib/team-identity';

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
  const raw = `${date}|${stripClubNoise(homeTeam)}|${stripClubNoise(awayTeam)}|${stripClubNoise(league)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
