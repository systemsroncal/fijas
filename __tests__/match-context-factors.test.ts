import {
  adjustMarketsForContext,
  multipliersFromReferee,
  inferRefereeFromSignals,
} from '@/lib/ai/match-context-factors';
import type { AnalysisMarket } from '@/lib/ai/analysis-types';

describe('match-context-factors', () => {
  it('raises card/foul multipliers for strict referees', () => {
    const m = multipliersFromReferee(
      {
        name: 'Test',
        style: 'strict',
        cardsTendency: 'high',
        notes: '',
        source: 'inferred',
      },
      { home: [], away: [] }
    );
    expect(m.cards).toBeGreaterThan(1.2);
    expect(m.fouls).toBeGreaterThan(1);
  });

  it('infers lenient style from textual signals', () => {
    const r = inferRefereeFromSignals({ tip: 'árbitro deja jugar, pocas tarjetas' });
    expect(r.style).toBe('lenient');
    expect(r.cardsTendency).toBe('low');
  });

  it('boosts tarjeta overs when cards multiplier > 1', () => {
    const markets: AnalysisMarket[] = [
      {
        market: 'Tarjetas totales +3.5',
        line: '3.5',
        odds: 1.9,
        aiProb: 48,
        edge: 0,
        verdict: 'neutral',
        source: 'implied',
      },
    ];
    const adjusted = adjustMarketsForContext(markets, {
      cards: 1.3,
      fouls: 1.2,
      goals: 1,
      note: 'test',
    });
    expect(adjusted[0].aiProb).toBeGreaterThan(48);
  });
});
