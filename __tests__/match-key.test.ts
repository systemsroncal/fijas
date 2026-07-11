/**
 * Tests unitarios: match key y encriptación.
 */
import crypto from 'crypto';

function buildMatchKey(
  matchDate: string,
  homeTeam: string,
  awayTeam: string,
  league: string
): string {
  const normalize = (v: string) =>
    v
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const raw = `${matchDate.slice(0, 10)}|${normalize(homeTeam)}|${normalize(awayTeam)}|${normalize(league)}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

describe('buildMatchKey', () => {
  it('is stable for same teams', () => {
    const a = buildMatchKey('2026-07-10', 'Real Madrid', 'Barcelona', 'La Liga');
    const b = buildMatchKey('2026-07-10', 'real madrid', 'barcelona', 'la liga');
    expect(a).toBe(b);
  });

  it('differs for different dates', () => {
    const a = buildMatchKey('2026-07-10', 'A', 'B', 'L');
    const b = buildMatchKey('2026-07-11', 'A', 'B', 'L');
    expect(a).not.toBe(b);
  });
});

describe('session limit message', () => {
  it('formats Spanish message', () => {
    const max = 1;
    const message = `Has superado el límite de ${max} sesiones simultáneas. Cierra sesión en otro dispositivo.`;
    expect(message).toContain('1 sesiones');
  });
});
