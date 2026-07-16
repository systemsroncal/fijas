/**
 * Enrich de análisis con football-data.org (standings + forma + marcador).
 */

import type { FormMatchRow, StructuredMatchPayload, TeamFormBlock } from '@/lib/ai/analysis-types';
import {
  findMatchContext,
  isFootballDataConfigured,
  primaryRefereeName,
  scoreOf,
  type FdMatch,
  type FdStandingRow,
} from '@/lib/football-data/client';
import { applyContextFactorsToPayload } from '@/lib/ai/match-context-factors';
import { sanitizeFormRows } from '@/lib/team-identity';

function mapMatches(matches: FdMatch[]): FormMatchRow[] {
  return matches.map((m) => ({
    matchId: `fd-${m.id}`,
    label: `${m.homeTeam?.name ?? '?'} vs ${m.awayTeam?.name ?? '?'}`,
    date: (m.utcDate ?? '').slice(0, 10),
    score: scoreOf(m),
    tip: m.status ?? null,
  }));
}

function standingLine(row: FdStandingRow | null, name: string): string | null {
  if (!row) return null;
  return `${name}: #${row.position} · ${row.points} pts · GF ${row.goalsFor} GA ${row.goalsAgainst}${
    row.form ? ` · forma ${row.form}` : ''
  }`;
}

export async function applyFootballDataToPayload(
  payload: StructuredMatchPayload
): Promise<StructuredMatchPayload> {
  if (!isFootballDataConfigured()) return payload;
  const match = payload.match;
  if (!match?.homeTeam || !match?.awayTeam) return payload;

  try {
    const ctx = await findMatchContext({
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      leagueHint: match.league,
    });

    const homeSeason = sanitizeFormRows(
      mapMatches(ctx.recentHome).filter((r) => r.score),
      match.homeTeam,
      match.awayTeam,
      match.league
    );
    const awaySeason = sanitizeFormRows(
      mapMatches(ctx.recentAway).filter((r) => r.score),
      match.homeTeam,
      match.awayTeam,
      match.league
    );
    const formBase: TeamFormBlock = payload.form ?? {
      available: false,
      message: '',
      recentScores: [],
      avgGoalsFor: null,
      avgGoalsAgainst: null,
      avgGoalsTotal: null,
      cardsTotal: null,
      avgCards: null,
      sampleSize: 0,
      rows: [],
      h2h: [],
      homeSeason: [],
      awaySeason: [],
    };

    const mergedHome = sanitizeFormRows(
      [...(formBase.homeSeason ?? []), ...homeSeason],
      match.homeTeam,
      match.awayTeam,
      match.league
    ).slice(0, 10);
    const mergedAway = sanitizeFormRows(
      [...(formBase.awaySeason ?? []), ...awaySeason],
      match.homeTeam,
      match.awayTeam,
      match.league
    ).slice(0, 10);
    const extraScores = sanitizeFormRows(
      [...homeSeason, ...awaySeason, ...(formBase.rows ?? [])],
      match.homeTeam,
      match.awayTeam,
      match.league
    )
      .map((r) => r.score!)
      .filter(Boolean)
      .slice(0, 8);

    const standingBits = [
      standingLine(ctx.standingsHome, match.homeTeam),
      standingLine(ctx.standingsAway, match.awayTeam),
    ].filter(Boolean) as string[];

    const form: TeamFormBlock = {
      ...formBase,
      available: formBase.available || homeSeason.length > 0 || awaySeason.length > 0 || Boolean(ctx.match),
      message: [formBase.message, ...ctx.notes, ...standingBits].filter(Boolean).join(' · '),
      recentScores: extraScores,
      sampleSize: Math.max(formBase.sampleSize, extraScores.length),
      rows: sanitizeFormRows(
        [...(formBase.rows ?? []), ...homeSeason, ...awaySeason],
        match.homeTeam,
        match.awayTeam,
        match.league
      ).slice(0, 12),
      homeSeason: mergedHome,
      awaySeason: mergedAway,
    };

    const ft = ctx.match ? scoreOf(ctx.match) : null;
    const refName = primaryRefereeName(ctx.match);
    const edgeExtra = [
      ctx.match
        ? `football-data.org: ${ctx.match.homeTeam?.name} vs ${ctx.match.awayTeam?.name} [${ctx.match.status}${ft ? ` ${ft}` : ''}]`
        : null,
      refName ? `Árbitro: ${refName}` : null,
      ...standingBits,
    ]
      .filter(Boolean)
      .join(' · ');

    const next: StructuredMatchPayload = {
      ...payload,
      form,
      edgeSummary: edgeExtra
        ? `${payload.edgeSummary} · ${edgeExtra}`
        : payload.edgeSummary,
      footballData: {
        source: 'football-data.org',
        usedRequests: ctx.usedRequests,
        matchId: ctx.match?.id ?? null,
        status: ctx.match?.status ?? null,
        score: ft,
        competition: ctx.match?.competition?.name ?? ctx.match?.competition?.code ?? null,
        standingsHome: ctx.standingsHome
          ? {
              position: ctx.standingsHome.position,
              points: ctx.standingsHome.points,
              form: ctx.standingsHome.form ?? null,
            }
          : null,
        standingsAway: ctx.standingsAway
          ? {
              position: ctx.standingsAway.position,
              points: ctx.standingsAway.points,
              form: ctx.standingsAway.form ?? null,
            }
          : null,
        notes: ctx.notes,
      },
    };

    return applyContextFactorsToPayload(next, {
      refereeName: refName,
      edgeNotes: ctx.notes,
    });
  } catch (err) {
    return {
      ...payload,
      edgeSummary: `${payload.edgeSummary} · football-data.org skip: ${
        err instanceof Error ? err.message.slice(0, 120) : 'error'
      }`,
    };
  }
}
