/**
 * Conversión de horarios scrapeados → America/Lima (Perú).
 * Muchas fuentes (SaferTip, etc.) publican hora UK/Europa.
 */

export const APP_TZ = 'America/Lima';
/** Zona en la que interpretamos el kickoff scrapeado (HH:mm + fecha). */
export const SOURCE_KICKOFF_TZ =
  process.env.KICKOFF_SOURCE_TZ?.trim() || 'Europe/London';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** True si hay una hora HH:mm usable. */
export function hasKickoffTime(kickoff?: string | null): boolean {
  return Boolean(kickoff?.trim() && /^\d{1,2}:\d{2}/.test(kickoff.trim()));
}

/** Fecha YYYY-MM-DD en una zona IANA. */
export function dateISOInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${day}`;
}

/** Hoy en Perú. */
export function peruDateISO(d = new Date()): string {
  return dateISOInTz(d, APP_TZ);
}

/** Suma días a YYYY-MM-DD (calendario civil). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Interpreta fecha+hora en `timeZone` y devuelve el instante UTC real.
 */
export function zonedDateTimeToUtc(
  ymd: string,
  hm: string,
  timeZone: string
): Date | null {
  const tm = hm.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!tm) return null;
  const [ys, ms, ds] = ymd.split('-').map(Number);
  const hours = Number(tm[1]);
  const minutes = Number(tm[2]);
  if (
    !ys ||
    !ms ||
    !ds ||
    hours > 23 ||
    minutes > 59 ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }

  // Ajuste iterativo: UTC tentativo → leer en TZ → corregir delta
  let utcMs = Date.UTC(ys, ms - 1, ds, hours, minutes, 0);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      fmt
        .formatToParts(new Date(utcMs))
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, p.value])
    ) as Record<string, string>;
    const gotH = parts.hour === '24' ? 0 : Number(parts.hour);
    const asIfUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      gotH,
      Number(parts.minute),
      Number(parts.second || 0)
    );
    const wanted = Date.UTC(ys, ms - 1, ds, hours, minutes, 0);
    utcMs += wanted - asIfUtc;
  }
  return new Date(utcMs);
}

/** HH:mm en zona destino. */
export function formatHmInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

/**
 * Kickoff scrapeado (hora fuente) → display Perú + instante para filtrar.
 */
export function resolveKickoffPeru(input: {
  matchDateYmd: string;
  kickoff?: string | null;
  sourceTz?: string;
}): {
  kickoffPeru: string | null;
  kickoffAt: Date | null;
  matchDatePeru: string;
} {
  const sourceTz = input.sourceTz ?? SOURCE_KICKOFF_TZ;
  const hm = input.kickoff?.trim() || null;
  if (!hm) {
    return {
      kickoffPeru: null,
      kickoffAt: null,
      matchDatePeru: input.matchDateYmd,
    };
  }
  const at = zonedDateTimeToUtc(input.matchDateYmd, hm, sourceTz);
  if (!at) {
    return {
      kickoffPeru: hm.slice(0, 5),
      kickoffAt: null,
      matchDatePeru: input.matchDateYmd,
    };
  }
  return {
    kickoffPeru: formatHmInTz(at, APP_TZ),
    kickoffAt: at,
    matchDatePeru: dateISOInTz(at, APP_TZ),
  };
}

/**
 * ¿El partido sigue visible en Perú?
 */
export function isMatchStillOpenPeru(input: {
  matchDateYmd: string;
  kickoff?: string | null;
  now?: Date;
  durationHours?: number;
  isLive?: boolean;
}): boolean {
  const now = input.now ?? new Date();
  const todayPeru = peruDateISO(now);
  const durationMs = (input.durationHours ?? 2.25) * 60 * 60 * 1000;

  if (input.isLive) return true;

  const resolved = resolveKickoffPeru({
    matchDateYmd: input.matchDateYmd,
    kickoff: input.kickoff,
  });

  // Fecha del partido en Perú (por kickoff real si hay)
  const day = resolved.matchDatePeru;
  if (day > todayPeru) return true;
  if (day < todayPeru) return false;

  if (!resolved.kickoffAt) {
    // Sin hora: usar hora actual Perú
    const hourPeru = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: APP_TZ,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(now)
    );
    return hourPeru < 20;
  }

  return now.getTime() < resolved.kickoffAt.getTime() + durationMs;
}
