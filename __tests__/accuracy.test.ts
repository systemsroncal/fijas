import {
  evaluateMarketVsScore,
  summarizeHits,
  evaluateAnalysisPayload,
} from '@/lib/ai/accuracy';
import type { StructuredMatchPayload } from '@/lib/ai/analysis-types';

describe('accuracy evaluateMarketVsScore', () => {
  it('scores 1X2 and O/U', () => {
    expect(evaluateMarketVsScore('1X2 Local', 2, 1).status).toBe('hit');
    expect(evaluateMarketVsScore('1X2 Empate', 1, 1).status).toBe('hit');
    expect(evaluateMarketVsScore('1X2 Visitante', 0, 2).status).toBe('hit');
    expect(evaluateMarketVsScore('+2.5 goles', 2, 1).status).toBe('hit');
    expect(evaluateMarketVsScore('-2.5 goles', 1, 0).status).toBe('hit');
    expect(evaluateMarketVsScore('BTTS Sí', 1, 1).status).toBe('hit');
    expect(evaluateMarketVsScore('BTTS No', 2, 0).status).toBe('hit');
  });

  it('marks stats as unknown without box score', () => {
    expect(evaluateMarketVsScore('Córners totales +9.5', 2, 1).status).toBe('unknown');
  });

  it('summarizes hit rate', () => {
    const picks = evaluateAnalysisPayload(
      {
        picks: {
          value: { market: '1X2 Local', odds: 1.8, aiProb: 55, rationale: '' },
          safe: { market: '+2.5 goles', odds: 1.9, aiProb: 58, rationale: '' },
          risky: null,
          avoid: null,
        },
        markets: [],
      } as unknown as StructuredMatchPayload,
      '2-1',
      true
    );
    const s = summarizeHits(picks);
    expect(s.hits).toBe(2);
    expect(s.hitRate).toBe(1);
  });
});
