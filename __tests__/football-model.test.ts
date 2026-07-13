import {
  computeEdge,
  poissonPmf,
  predictMatch,
  scanMatchEdges,
} from '@/lib/ai/football-model';

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

  it('scanMatchEdges produces value or safe candidates', () => {
    const ctx = {
      homeTeam: 'A',
      awayTeam: 'B',
      league: 'Test',
      tip: '1',
      oddsHome: 2.4,
    };
    const probs = predictMatch(ctx);
    const edges = scanMatchEdges(ctx, probs);
    expect(edges.length).toBeGreaterThan(5);
    const { edge } = computeEdge(0.55, 2.2);
    expect(edge).toBeGreaterThan(0);
  });
});
