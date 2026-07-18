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
): Promise<StructuredMatchPayload> {
  const match = payload.match;
  if (!match?.homeTeam || !match?.awayTeam) return payload;

  const enriched = await enrichMatchFromRapidApi({
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    matchDateYmd: match.matchDate ?? ctx.matchDateYmd ?? new Date().toISOString().slice(0, 10),
  });

  const ctxWithStats: MatchContext = {
    ...ctx,
    teamStatsHome: enriched.homeStats,
    teamStatsAway: enriched.awayStats,
    liveOdds: enriched.liveOdds,
  };

  const ctxMerged = mergeLiveOddsIntoContext(ctxWithStats, enriched.liveOdds);

  let next = buildModelPayload(ctxMerged, payload.mode === 'ACCUMULATOR' ? 'MATCH' : payload.mode ?? 'MATCH', {
    form: payload.form,
    relatedMatches: payload.relatedMatches,
  });

  next = {
    ...next,
    form: payload.form ?? next.form,
    edgeSummary: [payload.edgeSummary, ...enriched.notes].filter(Boolean).join(' · '),
    rapidApi: {
      homeStats: enriched.homeStats,
      awayStats: enriched.awayStats,
      liveOddsCount: enriched.liveOdds.length,
      notes: enriched.notes,
    },
  };

  if (payload.form?.available) {
    next = refreshModelWithForm(ctxMerged, next);
  }

  return next;
}
