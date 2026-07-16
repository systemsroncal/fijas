import { applyFormToMatchContext, summarizeTeamForm } from '@/lib/ai/form-stats';
import { predictMatch } from '@/lib/ai/football-model';
import type { FormMatchRow } from '@/lib/ai/analysis-types';

const clujRows: FormMatchRow[] = [
  { matchId: '1', label: 'CS Universitatea Craiova vs FC Universitatea Cluj', date: '2026-07-12', score: '1-1', tip: null, league: 'Supercopa' },
  { matchId: '2', label: 'FK Vojvodina vs FC Universitatea Cluj', date: '2026-07-02', score: '3-0', tip: null, league: 'Amistoso' },
  { matchId: '3', label: 'FC Universitatea Cluj vs Nyiregyhaza Spartacus', date: '2026-07-03', score: '0-3', tip: null, league: 'Amistoso' },
  { matchId: '4', label: 'Ujpest FC vs FC Universitatea Cluj', date: '2026-06-27', score: '0-0', tip: null, league: 'Amistoso' },
  { matchId: '5', label: 'FC Universitatea Cluj vs FC Dinamo Bucuresti', date: '2026-05-23', score: '1-1', tip: null, league: 'Superliga' },
  { matchId: '6', label: 'FC Universitatea Cluj vs Other Team', date: '2026-05-10', score: '0-1', tip: null, league: 'Superliga' },
];

const kyivRows: FormMatchRow[] = [
  { matchId: '7', label: 'LASK Linz vs Dynamo Kiev', date: '2026-07-03', score: '0-2', tip: null, league: 'Amistoso' },
  { matchId: '8', label: 'Dynamo Kiev vs FC Rapid 1923', date: '2026-07-02', score: '1-3', tip: null, league: 'Amistoso' },
  { matchId: '9', label: 'Dynamo Kiev vs WIECZYSTA KRAKOW', date: '2026-06-28', score: '4-2', tip: null, league: 'Amistoso' },
  { matchId: '10', label: 'Dynamo Kiev vs MSK Zilina', date: '2026-06-24', score: '2-0', tip: null, league: 'Amistoso' },
  { matchId: '11', label: 'Dynamo Kiev vs Slavia Praga', date: '2026-06-20', score: '1-1', tip: null, league: 'Amistoso' },
  { matchId: '12', label: 'Dynamo Kiev vs Test FC', date: '2026-06-15', score: '3-1', tip: null, league: 'Amistoso' },
];

describe('form-stats', () => {
  it('excluye H2H directo de la muestra de forma', () => {
    const withH2h = [
      { matchId: 'h2h', label: 'Dynamo Kiev vs FC Universitatea Cluj', date: '2026-07-09', score: '0-0', tip: null, league: 'UEL' },
      ...clujRows,
    ];
    const stats = summarizeTeamForm(withH2h, 'FC Universitatea Cluj', {
      excludeOpponent: 'Dynamo Kiev',
    });
    expect(stats).not.toBeNull();
    expect(stats!.winRate).toBe(0);
  });

  it('favorece visita con forma reciente superior (Cluj vs Kyiv)', () => {
    const ctx = applyFormToMatchContext(
      {
        homeTeam: 'U. Cluj',
        awayTeam: 'Dyn. Kyiv',
        league: 'UEL',
      },
      {
        available: true,
        homeSeason: clujRows,
        awaySeason: kyivRows,
        h2h: [{ matchId: 'h2h', label: 'Dynamo Kiev vs FC Universitatea Cluj', date: '2026-07-09', score: '0-0', tip: null, league: 'UEL' }],
      }
    );

    expect(ctx.formHome).not.toBeNull();
    expect(ctx.formAway).not.toBeNull();
    expect(ctx.formAway!.winRate).toBeGreaterThan(ctx.formHome!.winRate);
    expect(ctx.formAway!.avgGoalsFor).toBeGreaterThan(ctx.formHome!.avgGoalsFor);

    const probs = predictMatch(ctx);
    expect(probs.away).toBeGreaterThan(probs.home);
  });
});
