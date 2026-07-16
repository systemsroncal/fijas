/**
 * Estadísticas de forma reciente por equipo (prioridad sobre H2H antiguo).
 */

import type { FormMatchRow } from '@/lib/ai/analysis-types';
import { sameTeamIdentity } from '@/lib/team-identity';

/** Mínimo deseado de partidos recientes por equipo para modelo y UI. */
export const RECENT_MATCHES_MIN = 6;
/** Máximo de partidos recientes por equipo que se cargan, fusionan y muestran. */
export const RECENT_MATCHES_MAX = 15;

export type TeamRecentForm = {
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  sampleSize: number;
};

function parseTeams(label: string): { home: string; away: string } | null {
  const parts = label.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  return { home: parts[0].trim(), away: parts[1].trim() };
}

/** Goles a favor/en contra y resultado W/D/L para un equipo en una fila. */
export function goalsForTeamInRow(
  row: FormMatchRow,
  teamName: string
): { gf: number; ga: number; result: 'W' | 'D' | 'L' } | null {
  if (!row.score) return null;
  const teams = parseTeams(row.label);
  if (!teams) return null;
  const [h, a] = row.score.split('-').map(Number);
  if (Number.isNaN(h) || Number.isNaN(a)) return null;

  const isHome = sameTeamIdentity(teamName, teams.home);
  const isAway = sameTeamIdentity(teamName, teams.away);
  if (!isHome && !isAway) return null;

  const gf = isHome ? h : a;
  const ga = isHome ? a : h;
  const result: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
  return { gf, ga, result };
}

function leagueMatch(rowLeague: string | null | undefined, hint: string | null | undefined): boolean {
  if (!rowLeague || !hint) return false;
  const a = rowLeague.toLowerCase();
  const b = hint.toLowerCase();
  return a.includes(b) || b.includes(a) || /\buel\b|europa|conference|champions|ucl\b/.test(a) && /\buel\b|europa|conference|champions|ucl\b/.test(b);
}

/**
 * Resume forma reciente (últimos N con marcador).
 * Pesa más partidos del mismo torneo/competición cuando hay leagueHint.
 */
export function summarizeTeamForm(
  rows: FormMatchRow[],
  teamName: string,
  opts?: { maxRows?: number; leagueHint?: string | null; excludeOpponent?: string | null }
): TeamRecentForm | null {
  const maxRows = opts?.maxRows ?? RECENT_MATCHES_MAX;
  let weightedGf = 0;
  let weightedGa = 0;
  let weightedW = 0;
  let weightedD = 0;
  let weightedL = 0;
  let weightSum = 0;

  for (const row of rows) {
    if (opts?.excludeOpponent) {
      const teams = parseTeams(row.label);
      if (
        teams &&
        (sameTeamIdentity(opts.excludeOpponent, teams.home) ||
          sameTeamIdentity(opts.excludeOpponent, teams.away))
      ) {
        continue;
      }
    }
    const g = goalsForTeamInRow(row, teamName);
    if (!g) continue;

    let w = 1;
    if (opts?.leagueHint && leagueMatch(row.league, opts.leagueHint)) w = 1.6;
    // Partidos más recientes (rows ya vienen ordenados desc)
    const idx = rows.indexOf(row);
    if (idx <= 2) w *= 1.15;

    weightedGf += g.gf * w;
    weightedGa += g.ga * w;
    if (g.result === 'W') weightedW += w;
    else if (g.result === 'D') weightedD += w;
    else weightedL += w;
    weightSum += w;
    if (weightSum >= maxRows * 1.2) break;
  }

  if (weightSum < 2) return null;

  return {
    avgGoalsFor: Math.round((weightedGf / weightSum) * 100) / 100,
    avgGoalsAgainst: Math.round((weightedGa / weightSum) * 100) / 100,
    winRate: Math.round((weightedW / weightSum) * 1000) / 1000,
    drawRate: Math.round((weightedD / weightSum) * 1000) / 1000,
    lossRate: Math.round((weightedL / weightSum) * 1000) / 1000,
    sampleSize: Math.round(weightSum),
  };
}

/** Aplica forma reciente al contexto del modelo (sin inflar H2H). */
export function applyFormToMatchContext<
  T extends {
    homeTeam: string;
    awayTeam: string;
    league: string;
  },
>(
  ctx: T,
  form?: {
    homeSeason?: FormMatchRow[];
    awaySeason?: FormMatchRow[];
    h2h?: FormMatchRow[];
    available?: boolean;
  } | null
): T & {
  formHome: TeamRecentForm | null;
  formAway: TeamRecentForm | null;
  h2hCount: number;
} {
  if (!form?.available) {
    return {
      ...ctx,
      formHome: null,
      formAway: null,
      h2hCount: 0,
    };
  }

  const homeSeason = form.homeSeason ?? [];
  const awaySeason = form.awaySeason ?? [];

  // Forma reciente SIN el rival directo en la muestra (H2H aparte, peso mínimo)
  const formHome = summarizeTeamForm(homeSeason, ctx.homeTeam, {
    maxRows: RECENT_MATCHES_MAX,
    leagueHint: ctx.league,
    excludeOpponent: ctx.awayTeam,
  });
  const formAway = summarizeTeamForm(awaySeason, ctx.awayTeam, {
    maxRows: RECENT_MATCHES_MAX,
    leagueHint: ctx.league,
    excludeOpponent: ctx.homeTeam,
  });

  return {
    ...ctx,
    formHome,
    formAway,
    h2hCount: form.h2h?.length ?? 0,
  };
}
