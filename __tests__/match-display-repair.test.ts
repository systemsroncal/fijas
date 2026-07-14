import { repairMisparsedMatch, isJunkMatch } from '@/lib/match-display';
import { isMatchStillOpen, localDateISO } from '@/lib/local-date';

describe('repairMisparsedMatch', () => {
  it('separa SaferTip: hora en Local y "A Vs B" en Visitante', () => {
    const r = repairMisparsedMatch({
      homeTeam: '10:00',
      awayTeam: 'SP La Fiorita Vs FC Una Strassen',
      kickoff: null,
    });
    expect(r.repaired).toBe(true);
    expect(r.kickoff).toBe('10:00');
    expect(r.homeTeam).toBe('SP La Fiorita');
    expect(r.awayTeam).toBe('FC Una Strassen');
    expect(isJunkMatch(r.homeTeam, r.awayTeam)).toBe(false);
  });

  it('respeta StakeGains ya separado', () => {
    const r = repairMisparsedMatch({
      homeTeam: 'Libertad',
      awayTeam: 'LDU Quito',
      kickoff: '15:00',
    });
    expect(r.repaired).toBe(false);
    expect(r.homeTeam).toBe('Libertad');
    expect(r.awayTeam).toBe('LDU Quito');
  });
});

describe('localDateISO / isMatchStillOpen', () => {
  it('localDateISO no usa UTC del ISO', () => {
    const d = new Date(2026, 6, 13, 19, 15, 0); // 13 jul local
    expect(localDateISO(d)).toBe('2026-07-13');
  });

  it('oculta partidos cuya ventana ya cerró', () => {
    const now = new Date(2026, 6, 13, 19, 15, 0);
    expect(isMatchStillOpen('2026-07-13', '10:00', now)).toBe(false);
    expect(isMatchStillOpen('2026-07-13', '18:00', now)).toBe(true);
    expect(isMatchStillOpen('2026-07-13', '20:00', now)).toBe(true);
  });
});
