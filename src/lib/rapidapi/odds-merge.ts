/**
 * Fusiona cuotas live (RapidAPI) sobre el contexto scrapeado para edge dinámico.
 */

import type { LiveMarketQuote } from '@/lib/analysis/contracts';
import type { MatchContext } from '@/lib/ai/football-model';

function pickOdds(quotes: LiveMarketQuote[], patterns: RegExp[]): number | null {
  for (const q of quotes) {
    const label = `${q.market} ${q.selection} ${q.line ?? ''}`.toLowerCase();
    if (patterns.some((p) => p.test(label))) return q.odds;
  }
  return null;
}

export function mergeLiveOddsIntoContext(
  ctx: MatchContext,
  quotes: LiveMarketQuote[]
): MatchContext {
  if (!quotes.length) return ctx;

  const oddsHome =
    pickOdds(quotes, [/home|local|^1$|h2h.*home/i]) ?? ctx.oddsHome ?? null;
  const oddsAway =
    pickOdds(quotes, [/away|visit|^2$|h2h.*away/i]) ?? ctx.oddsAway ?? null;
  const oddsDraw = pickOdds(quotes, [/draw|empate|^x$/i]) ?? ctx.oddsDraw ?? null;
  const oddsOver =
    pickOdds(quotes, [/over|\+.*goles|totals.*over/i]) ?? ctx.oddsOver ?? null;
  const oddsUnder =
    pickOdds(quotes, [/under|-.*goles|totals.*under/i]) ?? ctx.oddsUnder ?? null;

  return {
    ...ctx,
    oddsHome,
    oddsDraw,
    oddsAway,
    oddsOver,
    oddsUnder,
    liveOdds: quotes,
    oddsSource: quotes.some((q) => q.source === 'rapidapi') ? 'rapidapi' : ctx.oddsSource,
  };
}
