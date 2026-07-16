/**
 * Enrich de análisis con football-data.org (standings + forma + marcador).
 */

import type { FormMatchRow, StructuredMatchPayload, TeamFormBlock } from '@/lib/ai/analysis-types';
import {
  findMatchContext,
  isFootballDataConfigured,
  scoreOf,
  type FdMatch,
  type FdStandingRow,
} from '@/lib/football-data/client';

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

    const homeSeason = mapMatches(ctx.recentHome).filter((r) => r.score);
    const awaySeason = mapMatches(ctx.recentAway).filter((r) => r.score);
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

    const mergedHome = [...(formBase.homeSeason ?? []), ...homeSeason].slice(0, 10);
    const mergedAway = [...(formBase.awaySeason ?? []), ...awaySeason].slice(0, 10);
    const extraScores = [...homeSeason, ...awaySeason]
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
      recentScores: [...extraScores, ...(formBase.recentScores ?? [])].slice(0, 12),
      sampleSize: Math.max(formBase.sampleSize, homeSeason.length + awaySeason.length),
      homeSeason: mergedHome,
      awaySeason: mergedAway,
    };

    const ft = ctx.match ? scoreOf(ctx.match) : null;
    const edgeExtra = [
      ctx.match
        ? `football-data.org: ${ctx.match.homeTeam?.name} vs ${ctx.match.awayTeam?.name} [${ctx.match.status}${ft ? ` ${ft}` : ''}]`
        : null,
      ...standingBits,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
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
  } catch (err) {
    return {
      ...payload,
      edgeSummary: `${payload.edgeSummary} · football-data.org skip: ${
        err instanceof Error ? err.message.slice(0, 120) : 'error'
      }`,
    };
  }
}
