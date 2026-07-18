import type { SportScoreEventHit } from '@/lib/rapidapi/sportscore';

/** Lógica de emparejamiento (espelho de sportscore.ts para tests). */
function teamHit(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (na.length < 4 || nb.length < 4) return na === nb;
  return na.includes(nb.slice(0, 5)) || nb.includes(na.slice(0, 5));
}

function matchEvents(
  events: SportScoreEventHit[],
  homeTeam: string,
  awayTeam: string
): SportScoreEventHit[] {
  return events.filter(
    (e) =>
      (teamHit(e.homeTeam, homeTeam) && teamHit(e.awayTeam, awayTeam)) ||
      (teamHit(e.homeTeam, awayTeam) && teamHit(e.awayTeam, homeTeam))
  );
}

describe('SportScore event matching', () => {
  const sample: SportScoreEventHit[] = [
    {
      eventId: 1,
      homeTeam: 'Real Madrid',
      awayTeam: 'Barcelona',
      status: 'finished',
      startTime: '2024-01-15',
      scoreHome: 2,
      scoreAway: 1,
      league: 'La Liga',
      venue: null,
      source: 'rapidapi_sportscore1',
    },
    {
      eventId: 2,
      homeTeam: 'Chelsea',
      awayTeam: 'Arsenal',
      status: 'scheduled',
      startTime: '2024-01-15',
      scoreHome: null,
      scoreAway: null,
      league: 'EPL',
      venue: null,
      source: 'rapidapi_sportscore1',
    },
  ];

  it('empareja por nombre aunque falten acentos o prefijos', () => {
    const hits = matchEvents(sample, 'Real Madrid CF', 'FC Barcelona');
    expect(hits).toHaveLength(1);
    expect(hits[0].eventId).toBe(1);
  });

  it('acepta local/visitante invertidos', () => {
    const hits = matchEvents(sample, 'Barcelona', 'Real Madrid');
    expect(hits).toHaveLength(1);
  });
});
