/**
 * Hora real de evento TheSportsDB → America/Lima.
 * strTimestamp / strTime en free V1 son UTC (sin sufijo Z).
 */

import type { SportsDbEvent } from '@/lib/sportsdb/client';
import {
  APP_TZ,
  dateISOInTz,
  formatHmInTz,
  zonedDateTimeToUtc,
} from '@/lib/timezone';

const FINISHED_RE =
  /^(ft|aet|pen|after pen\.?|finished|match finished|awarded|can|cancelled|canceled|pst|postponed|abd|abandoned)$/i;

export function isSportsDbFinished(event: SportsDbEvent | null | undefined): boolean {
  const s = event?.strStatus?.trim();
  if (!s) return false;
  return FINISHED_RE.test(s);
}

/** Instante UTC del saque inicial según TheSportsDB. */
export function eventKickoffAt(event: SportsDbEvent): Date | null {
  const ts = event.strTimestamp?.trim();
  if (ts) {
    const iso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(ts) ? ts : `${ts}Z`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const date = event.dateEvent?.trim();
  const time = event.strTime?.trim();
  if (date && time) {
    const hm = time.slice(0, 5);
    return zonedDateTimeToUtc(date, hm, 'UTC');
  }
  return null;
}

export function resolveEventKickoffPeru(event: SportsDbEvent): {
  kickoffPeru: string | null;
  kickoffAt: Date | null;
  matchDatePeru: string | null;
} {
  const at = eventKickoffAt(event);
  if (!at) {
    // Último recurso: hora local del venue (a menudo ya PET/CDT en Mundiales USA)
    const local = event.strTimeLocal?.trim()?.slice(0, 5);
    const localDate = event.dateEventLocal?.trim() || event.dateEvent?.trim();
    if (local && localDate && /^\d{1,2}:\d{2}$/.test(local)) {
      const atLocal = zonedDateTimeToUtc(localDate, local, APP_TZ);
      if (atLocal) {
        return {
          kickoffPeru: local,
          kickoffAt: atLocal,
          matchDatePeru: localDate,
        };
      }
      return { kickoffPeru: local, kickoffAt: null, matchDatePeru: localDate };
    }
    return { kickoffPeru: null, kickoffAt: null, matchDatePeru: null };
  }
  return {
    kickoffPeru: formatHmInTz(at, APP_TZ),
    kickoffAt: at,
    matchDatePeru: dateISOInTz(at, APP_TZ),
  };
}

/** Ligas donde el tipster suele fallar la zona (sede distinta a UK). */
export function shouldPreferSportsDbKickoff(league: string): boolean {
  return /world cup|mundial|fifa\b|club world|nations league|copa am[eé]rica|gold cup|olympic/i.test(
    league
  );
}
