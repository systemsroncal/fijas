/**
 * Baselines de goles esperados (λ) por liga cuando no hay forma ni cuotas scrapeadas.
 */

export function leagueLambdaBaselines(league: string | null | undefined): {
  home: number;
  away: number;
  label: string;
} {
  const l = (league ?? '').toLowerCase();

  if (/chn|csl|china|super league|jinmen|shenhua/i.test(l)) {
    return { home: 1.38, away: 1.26, label: 'China (alta media goles)' };
  }
  if (/uru|uruguay|primera|nacional|wanderers|penarol|peñarol/i.test(l)) {
    return { home: 1.2, away: 0.98, label: 'Uruguay (ligera ventaja local)' };
  }
  if (/bra|brasil|serie a/i.test(l)) return { home: 1.28, away: 1.08, label: 'Brasil' };
  if (/arg|argentina/i.test(l)) return { home: 1.22, away: 1.02, label: 'Argentina' };
  if (/mex|liga mx/i.test(l)) return { home: 1.3, away: 1.12, label: 'México' };
  if (/epl|premier|eng/i.test(l)) return { home: 1.42, away: 1.18, label: 'Inglaterra' };
  if (/laliga|esp|spain/i.test(l)) return { home: 1.32, away: 1.1, label: 'España' };
  if (/serie a|ita|ital/i.test(l)) return { home: 1.28, away: 1.05, label: 'Italia' };
  if (/bund|ger|deutsch/i.test(l)) return { home: 1.45, away: 1.22, label: 'Alemania' };
  if (/france|ligue|fra/i.test(l)) return { home: 1.35, away: 1.12, label: 'Francia' };
  if (/uefa|ucl|champions|europa|conference/i.test(l)) {
    return { home: 1.38, away: 1.15, label: 'Competiciones UEFA' };
  }

  return { home: 1.18, away: 1.05, label: 'Media general fútbol' };
}

/** Ajuste λ por stats rolling RapidAPI (tiros a puerta). */
export function adjustLambdasFromTeamStats(
  home: number,
  away: number,
  statsHome?: { shotsOnTarget: number; sampleSize: number } | null,
  statsAway?: { shotsOnTarget: number; sampleSize: number } | null
): { home: number; away: number } {
  if (!statsHome?.sampleSize || !statsAway?.sampleSize) return { home, away };
  const hAtk = statsHome.shotsOnTarget / 4.5;
  const aAtk = statsAway.shotsOnTarget / 4.5;
  const hDef = statsAway.shotsOnTarget / 5;
  const aDef = statsHome.shotsOnTarget / 5;
  return {
    home: home * 0.7 + (hAtk + hDef) * 0.15,
    away: away * 0.7 + (aAtk + aDef) * 0.15,
  };
}
