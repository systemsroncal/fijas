/**
 * Aplica enriquecimiento RapidAPI al payload y recalcula mercados con cuotas live.
 */

import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';
import type { MatchContext } from '@/lib/ai/football-model';
import { enrichMatchFromRapidApi } from '@/lib/rapidapi/client';
import { refreshModelWithForm, buildModelPayload } from '@/lib/ai/structured-analysis';
import { mergeLiveOddsIntoContext } from '@/lib/rapidapi/odds-merge';

export async function applyRapidApiToPayload(
  payload: StructuredMatchPayload,
  ctx: MatchContext & { id?: string }
): Promise<{ payload: StructuredMatchPayload; ctx: MatchContext & { id?: string } }> {
  const match = payload.match;
  if (!match?.homeTeam || !match?.awayTeam) return { payload, ctx };

  const enriched = await enrichMatchFromRapidApi({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    matchDateYmd: match.matchDate ?? ctx.matchDateYmd ?? new Date().toISOString().slice(0, 10),
  });

  const fp = enriched.footballPrediction;
  const externalProb1x2 =
    fp?.probHome != null && fp?.probAway != null
      ? {
          home: fp.probHome > 1 ? fp.probHome / 100 : fp.probHome,
          draw:
            fp.probDraw != null
              ? fp.probDraw > 1
                ? fp.probDraw / 100
                : fp.probDraw
              : 0.28,
          away: fp.probAway > 1 ? fp.probAway / 100 : fp.probAway,
        }
      : ctx.externalProb1x2 ?? null;

  const ctxWithStats: MatchContext = {
    ...ctx,
    teamStatsHome: enriched.homeStats,
    teamStatsAway: enriched.awayStats,
    liveOdds: enriched.liveOdds,
    externalProb1x2,
  };

  const ctxMerged = mergeLiveOddsIntoContext(ctxWithStats, enriched.liveOdds);

  let next = buildModelPayload(ctxMerged, payload.mode === 'ACCUMULATOR' ? 'MATCH' : payload.mode ?? 'MATCH', {
    form: payload.form,
    relatedMatches: payload.relatedMatches,
  });

  const primaryEvent = enriched.sportScore.events[0] ?? null;

  next = {
    ...next,
    form: payload.form ?? next.form,
    edgeSummary: [payload.edgeSummary, ...enriched.notes].filter(Boolean).join(' · '),
    rapidApi: {
      homeStats: enriched.homeStats,
      awayStats: enriched.awayStats,
      liveOddsCount: enriched.liveOdds.length,
      footballPrediction: enriched.footballPrediction
        ? {
            prediction: enriched.footballPrediction.prediction,
            probHome: enriched.footballPrediction.probHome,
            probDraw: enriched.footballPrediction.probDraw,
            probAway: enriched.footballPrediction.probAway,
            federation: enriched.footballPrediction.federation,
          }
        : null,
      sportScore: {
        eventCount: enriched.sportScore.events.length,
        primaryEvent: primaryEvent
          ? {
              homeTeam: primaryEvent.homeTeam,
              awayTeam: primaryEvent.awayTeam,
              status: primaryEvent.status,
              score:
                primaryEvent.scoreHome != null && primaryEvent.scoreAway != null
                  ? `${primaryEvent.scoreHome}-${primaryEvent.scoreAway}`
                  : null,
              league: primaryEvent.league,
            }
          : null,
        homeTeamProfile: enriched.sportScore.homeTeamProfile
          ? {
              name: enriched.sportScore.homeTeamProfile.name,
              league: enriched.sportScore.homeTeamProfile.league,
            }
          : null,
        awayTeamProfile: enriched.sportScore.awayTeamProfile
          ? {
              name: enriched.sportScore.awayTeamProfile.name,
              league: enriched.sportScore.awayTeamProfile.league,
            }
          : null,
      },
      notes: enriched.notes,
    },
  };

  if (payload.form?.available) {
    next = refreshModelWithForm(ctxMerged, next);
  }

  return { payload: next, ctx: ctxMerged };
}
