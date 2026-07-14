/**
 * Fecha/hora local (evita el bug de toISOString() → día siguiente en UTC-5).
 */

/** YYYY-MM-DD en zona horaria local del navegador/servidor. */
export function localDateISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

/** Extrae HH:mm de un kickoff libre. */
export function parseKickoffHm(kickoff: string | null | undefined): {
  hours: number;
  minutes: number;
} | null {
  if (!kickoff) return null;
  const m = kickoff.trim().match(TIME_RE);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * True si el partido aún no debería ocultarse:
 * - sin hora → se muestra
 * - con hora → visible hasta kickoff + durationHours (default 2.5h)
 */
export function isMatchStillOpen(
  matchDateYmd: string,
  kickoff: string | null | undefined,
  now = new Date(),
  durationHours = 2.5
): boolean {
  const today = localDateISO(now);
  if (matchDateYmd > today) return true;
  if (matchDateYmd < today) return false;

  const hm = parseKickoffHm(kickoff);
  if (!hm) return true; // sin hora: no filtramos

  const start = new Date(now);
  start.setHours(hm.hours, hm.minutes, 0, 0);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return now.getTime() < end.getTime();
}
