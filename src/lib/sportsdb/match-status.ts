/**
 * Resultado / live / estadísticas de un partido vía TheSportsDB Free V1.
 * Sin livescore V2 de pago: usamos lookupevent + lookupeventstats + lookuptimeline.
 */

import {
  eventsOnDay,
  findEventInDayList,
  lookupEvent,
  lookupEventStats,
  lookupEventTimeline,
  searchEvent,
  sportApiLabel,
  type SportsDbEvent,
  type SportsDbEventStat,
  type SportsDbTimelineItem,
} from '@/lib/sportsdb/client';
import { localDateISO } from '@/lib/local-date';

export type MatchPhase = 'scheduled' | 'live' | 'finished' | 'unknown';

export type MatchStatusPayload = {
  source: 'thesportsdb';
  phase: MatchPhase;
  eventId: string | null;
  label: string | null;
  league: string | null;
  date: string | null;
  status: string | null;
  progress: string | null;
  score: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  venue: string | null;
  stats: Array<{ name: string; home: string; away: string }>;
  timeline: Array<{
    minute: string;
    type: string;
    detail: string;
    player: string;
    team: string;
    assist?: string;
  }>;
  notes: string[];
  fetchedAt: string;
};

function parseScore(ev: SportsDbEvent | null): {
  score: string | null;
  homeScore: number | null;
  awayScore: number | null;
} {
  if (!ev || ev.intHomeScore == null || ev.intAwayScore == null) {
    return { score: null, homeScore: null, awayScore: null };
  }
  if (ev.intHomeScore === '' || ev.intAwayScore === '') {
    return { score: null, homeScore: null, awayScore: null };
  }
  const homeScore = Number(ev.intHomeScore);
  const awayScore = Number(ev.intAwayScore);
  if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
    return { score: null, homeScore: null, awayScore: null };
  }
  return {
    score: `${homeScore}-${awayScore}`,
    homeScore,
    awayScore,
  };
}

export function classifyPhase(
  status: string | null | undefined,
  hasScore: boolean,
  scrapeIsLive?: boolean
): MatchPhase {
  const s = (status ?? '').trim().toUpperCase();
  if (
    s === 'FT' ||
    s === 'AET' ||
    s === 'PEN' ||
    s === 'FINISHED' ||
    s === 'AFTER PEN.' ||
    s === 'AWARDED'
  ) {
    return 'finished';
  }
  if (
    scrapeIsLive ||
    s === 'LIVE' ||
    s === '1H' ||
    s === '2H' ||
    s === 'HT' ||
    s === 'ET' ||
    s === 'BT' ||
    s === 'P' ||
    s.includes('LIVE') ||
    s.includes('IN PLAY')
  ) {
    return 'live';
  }
  if (s === 'NS' || s === 'TBD' || s === 'SCHEDULED' || s === '' || s === 'NOT STARTED') {
    return hasScore ? 'finished' : 'scheduled';
  }
  if (hasScore && (s === 'POSTPONED' || s === 'CANCELLED')) return 'unknown';
  if (hasScore) return 'finished';
  return s ? 'unknown' : hasScore ? 'finished' : 'scheduled';
}

function mapStats(rows: SportsDbEventStat[]) {
  return rows
    .filter((r) => r.strStat)
    .map((r) => ({
      name: r.strStat!,
      home: r.intHome ?? '—',
      away: r.intAway ?? '—',
    }));
}

function mapTimeline(rows: SportsDbTimelineItem[]) {
  return rows.map((r) => ({
    minute: r.intTime ?? '—',
    type: r.strTimeline ?? '',
    detail: r.strTimelineDetail ?? '',
    player: r.strPlayer ?? '',
    team: r.strTeam ?? '',
    assist: r.strAssist || undefined,
  }));
}

async function resolveEventId(input: {
  eventId?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  matchDateYmd?: string;
  sportKind?: string;
}): Promise<{ event: SportsDbEvent | null; notes: string[] }> {
  const notes: string[] = [];
  if (input.eventId) {
    const ev = await lookupEvent(input.eventId, { bypassCache: true });
    if (ev) return { event: ev, notes };
    notes.push('idEvent guardado no resolvió; se intenta por equipos/fecha.');
  }

  const date = input.matchDateYmd ?? localDateISO();
  const sport = sportApiLabel(input.sportKind);
  if (input.homeTeam && input.awayTeam) {
    let day = await eventsOnDay(date, sport);
    if (!day.length && sport) day = await eventsOnDay(date);
    let matched = findEventInDayList(day, input.homeTeam, input.awayTeam);
    if (matched?.idEvent) {
      const fresh = await lookupEvent(matched.idEvent, { bypassCache: true });
      notes.push('Evento resuelto vía eventsday free.');
      return { event: fresh ?? matched, notes };
    }
    matched = await searchEvent(input.homeTeam, input.awayTeam);
    if (matched?.idEvent) {
      const fresh = await lookupEvent(matched.idEvent, { bypassCache: true });
      notes.push('Evento resuelto vía searchevents free.');
      return { event: fresh ?? matched, notes };
    }
  }

  notes.push('Sin evento TheSportsDB free para este partido.');
  return { event: null, notes };
}

/**
 * Carga marcador + stats + timeline (free).
 * includeDetails=false → solo marcador/status (menos requests).
 */
export async function fetchMatchStatus(input: {
  eventId?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  matchDateYmd?: string;
  sportKind?: string;
  scrapeIsLive?: boolean;
  includeDetails?: boolean;
}): Promise<MatchStatusPayload> {
  const includeDetails = input.includeDetails !== false;
  const { event, notes } = await resolveEventId(input);
  const scores = parseScore(event);
  const status = event?.strStatus ?? null;
  const phase = classifyPhase(status, Boolean(scores.score), input.scrapeIsLive);

  let stats: MatchStatusPayload['stats'] = [];
  let timeline: MatchStatusPayload['timeline'] = [];

  if (event?.idEvent && includeDetails && (phase === 'live' || phase === 'finished')) {
    const bypass = phase === 'live';
    const [rawStats, rawTl] = await Promise.all([
      lookupEventStats(event.idEvent, { bypassCache: bypass }),
      lookupEventTimeline(event.idEvent, { bypassCache: bypass }),
    ]);
    stats = mapStats(rawStats);
    timeline = mapTimeline(rawTl);
    if (!stats.length) notes.push('Sin estadísticas detalladas aún (o no disponibles en free).');
    if (!timeline.length) notes.push('Sin timeline de eventos aún.');
  } else if (phase === 'scheduled') {
    notes.push('Partido aún no iniciado: no hay stats en vivo.');
  }

  return {
    source: 'thesportsdb',
    phase,
    eventId: event?.idEvent ?? null,
    label: event?.strEvent ?? null,
    league: event?.strLeague ?? null,
    date: event?.dateEvent ?? input.matchDateYmd ?? null,
    status,
    progress: event?.strProgress ?? null,
    score: scores.score,
    homeScore: scores.homeScore,
    awayScore: scores.awayScore,
    homeTeam: event?.strHomeTeam ?? input.homeTeam ?? null,
    awayTeam: event?.strAwayTeam ?? input.awayTeam ?? null,
    venue: event?.strVenue ?? null,
    stats,
    timeline,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}
