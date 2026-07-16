import {
  computeEdge,
  poissonPmf,
  predictMatch,
  scanMatchEdges,
} from '@/lib/ai/football-model';
import { formatMarketLabel, isJunkMatch } from '@/lib/match-display';

describe('football-model', () => {
  it('poisson pmf sums near 1 for k=0..10', () => {
    const lambda = 1.4;
    let s = 0;
    for (let k = 0; k <= 12; k++) s += poissonPmf(lambda, k);
    expect(s).toBeGreaterThan(0.99);
    expect(s).toBeLessThanOrEqual(1.01);
  });

  it('predictMatch returns normalized 1X2', () => {
    const p = predictMatch({
      homeTeam: 'A',
      awayTeam: 'B',
      league: 'Test',
      tip: '1',
      oddsHome: 1.8,
      oddsDraw: 3.5,
      oddsAway: 4.5,
    });
    const sum = p.home + p.draw + p.away;
    expect(sum).toBeGreaterThan(0.99);
    expect(sum).toBeLessThanOrEqual(1.01);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it('forma reciente puede invertir favorito vs tip local', () => {
    const p = predictMatch({
      homeTeam: 'U. Cluj',
      awayTeam: 'Dyn. Kyiv',
      league: 'UEL',
      tip: '1',
      formHome: {
        avgGoalsFor: 0.33,
        avgGoalsAgainst: 1.33,
        winRate: 0,
        drawRate: 0.67,
        lossRate: 0.33,
        sampleSize: 6,
      },
      formAway: {
        avgGoalsFor: 1.67,
        avgGoalsAgainst: 1,
        winRate: 0.5,
        drawRate: 0.33,
        lossRate: 0.17,
        sampleSize: 6,
      },
      h2hCount: 1,
    });
    expect(p.away).toBeGreaterThan(p.home);
  });

  it('scanMatchEdges uses +goles labels', () => {
    const ctx = {
      homeTeam: 'A',
      awayTeam: 'B',
      league: 'Test',
      tip: '1',
      oddsHome: 2.4,
    };
    const probs = predictMatch(ctx);
    const edges = scanMatchEdges(ctx, probs);
    expect(edges.some((e) => e.market.includes('+1.5'))).toBe(true);
    expect(edges.some((e) => e.market.includes('-2.5'))).toBe(true);
    const { edge } = computeEdge(0.55, 2.2);
    expect(edge).toBeGreaterThan(0);
  });
});

describe('match-display', () => {
  it('filters Time vs Match junk', () => {
    expect(isJunkMatch('Time', 'Match')).toBe(true);
    expect(isJunkMatch('CA Cerro Largo', 'Defensor Sporting')).toBe(false);
  });

  it('formats over/under as +/- ', () => {
    expect(formatMarketLabel('Over 1.5', '1.5')).toMatch(/^\+1\.5/);
    expect(formatMarketLabel('Under 2.5', '2.5')).toMatch(/^-2\.5/);
  });
});
