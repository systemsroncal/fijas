import { sourcesForSport } from '@/lib/ai/external-sources';

describe('external-sources sport filter', () => {
  it('excludes NBA and NFL for football analysis popup', () => {
    const ids = sourcesForSport('football').map((s) => s.id);
    expect(ids).not.toContain('nba');
    expect(ids).not.toContain('nfl');
    expect(ids).toContain('flashscore');
    expect(ids).toContain('football_data');
  });

  it('includes NBA only for basketball', () => {
    const ids = sourcesForSport('basketball').map((s) => s.id);
    expect(ids).toContain('nba');
    expect(ids).not.toContain('nfl');
    expect(ids).not.toContain('football_data');
  });
});
