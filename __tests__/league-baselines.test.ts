import { leagueLambdaBaselines } from '@/lib/ai/league-baselines';

describe('leagueLambdaBaselines', () => {
  it('diferencia China vs Uruguay', () => {
    const cn = leagueLambdaBaselines('CHN D1');
    const uy = leagueLambdaBaselines('URU Primera');
    expect(cn.home).not.toBe(uy.home);
    expect(cn.away).not.toBe(uy.away);
  });
});
