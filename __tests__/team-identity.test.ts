import {
  dedupeFormRows,
  detectTeamCategory,
  isOutlierFootballScore,
  sameTeamIdentity,
  sanitizeFormRows,
} from '@/lib/team-identity';
import type { FormMatchRow } from '@/lib/ai/analysis-types';

describe('team-identity', () => {
  it('matches FC Astana with Astana', () => {
    expect(sameTeamIdentity('FC Astana', 'Astana')).toBe(true);
    expect(sameTeamIdentity('Astana', 'FC Astana')).toBe(true);
  });

  it('matches Dinamo City with Dinamo', () => {
    expect(sameTeamIdentity('Dinamo City', 'Dinamo')).toBe(true);
  });

  it('does not match Real Madrid with Real Sociedad', () => {
    expect(sameTeamIdentity('Real Madrid', 'Real Sociedad')).toBe(false);
  });

  it('detects women and youth categories', () => {
    expect(detectTeamCategory('Barcelona W', 'La Liga')).toBe('senior_women');
    expect(detectTeamCategory('Barcelona', 'U19 League')).toBe('youth');
    expect(detectTeamCategory('FC Astana', 'Premier League')).toBe('senior_men');
  });

  it('flags outlier scores like 18-0', () => {
    expect(isOutlierFootballScore('18-0')).toBe(true);
    expect(isOutlierFootballScore('3-2')).toBe(false);
  });

  it('dedupes same fixture across alias names within 2 days', () => {
    const rows: FormMatchRow[] = [
      {
        matchId: '1',
        label: 'Astana vs Aktobe',
        date: '2026-07-12',
        score: '3-2',
        tip: null,
      },
      {
        matchId: '2',
        label: 'FC Astana vs Aktobe',
        date: '2026-07-13',
        score: '3-0',
        tip: null,
      },
    ];
    const out = dedupeFormRows(rows, { dateWindowDays: 2 });
    expect(out).toHaveLength(1);
    expect(out[0].score).toBe('3-2');
    expect(out[0].date).toBe('2026-07-12');
    expect(out[0].label).toContain('FC Astana');
  });

  it('drops women/youth rows when analyzing senior men', () => {
    const rows: FormMatchRow[] = [
      {
        matchId: '1',
        label: 'FC Astana vs Aktobe',
        date: '2026-07-13',
        score: '3-0',
        tip: null,
      },
      {
        matchId: '2',
        label: 'FC Astana W vs Aktobe W',
        date: '2026-07-14',
        score: '2-1',
        tip: null,
      },
      {
        matchId: '3',
        label: 'FC Astana vs Dinamo',
        date: '2026-07-16',
        score: '18-0',
        tip: null,
      },
    ];
    const out = sanitizeFormRows(rows, 'FC Astana', 'Dinamo City', 'Premier League');
    expect(out).toHaveLength(1);
    expect(out[0].label).toContain('Aktobe');
    expect(out[0].score).toBe('3-0');
  });
});
