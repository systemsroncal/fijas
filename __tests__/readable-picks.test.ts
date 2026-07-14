import {
  areMarketsCompatible,
  formatReadablePick,
  marketFamily,
} from '@/lib/match-display';

describe('formatReadablePick', () => {
  it('traduce 1/X/2 a nombres de equipo', () => {
    expect(formatReadablePick('1', 'España', 'Francia')).toBe('España GANA');
    expect(formatReadablePick('X', 'España', 'Francia')).toBe('EMPATE');
    expect(formatReadablePick('2', 'España', 'Francia')).toBe('Francia GANA');
  });

  it('traduce mercados 1X2 del modelo', () => {
    expect(formatReadablePick('1X2 Local', 'España', 'Francia')).toBe('España GANA');
    expect(formatReadablePick('1X2 Empate', 'España', 'Francia')).toBe('EMPATE');
    expect(formatReadablePick('1X2 Visitante', 'España', 'Francia')).toBe('Francia GANA');
  });

  it('traduce doble oportunidad', () => {
    expect(formatReadablePick('1X', 'España', 'Francia')).toBe('España GANA O EMPATE');
    expect(formatReadablePick('X2', 'España', 'Francia')).toBe('EMPATE O Francia GANA');
  });
});

describe('areMarketsCompatible', () => {
  it('bloquea 1X2 opuestos y permite huecos same-match', () => {
    expect(areMarketsCompatible('1X2 Local', '1X2 Visitante')).toBe(false);
    expect(areMarketsCompatible('1X2 Local', '+1.5 goles')).toBe(true);
    expect(areMarketsCompatible('BTTS Sí', 'BTTS No')).toBe(false);
    expect(marketFamily('1X2 Local')).toBe('home');
  });
});
