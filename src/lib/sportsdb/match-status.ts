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
import {
  isPriorityStat,
  PRIORITY_STAT_KEYS,
  translateMatchStatus,
  translateStatName,
  translateTimelineDetail,
  translateTimelineType,
} from '@/lib/sportsdb/labels-es';
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
  statusLabel: string | null;
  progress: string | null;
  score: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** true si el marcador se reconstruyó desde goles de la cronología */
  scoreFromTimeline: boolean;
  homeTeam: string | null;
  awayTeam: string | null;
  venue: string | null;
  stats: Array<{ name: string; home: string; away: string; key?: string }>;
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

/**
 * Reconstruye marcador desde timeline (más fresco que lookupevent a veces).
 */
export function scoreFromTimelineGoals(
  rows: SportsDbTimelineItem[],
  homeTeamName?: string | null,
  awayTeamName?: string | null
): { homeScore: number; awayScore: number } | null {
  let home = 0;
  let away = 0;
  let counted = 0;

  for (const r of rows) {
    const type = (r.strTimeline ?? '').toLowerCase();
    const detail = (r.strTimelineDetail ?? '').toLowerCase();
    const isGoal =
      type === 'goal' ||
      detail.includes('normal goal') ||
      detail === 'penalty' ||
      detail.includes('own goal');
    if (!isGoal) continue;
    if (detail.includes('missed')) continue;

    const isOwn = detail.includes('own');
    const homeFlag = (r.strHome ?? '').toLowerCase();
    const team = (r.strTeam ?? '').toLowerCase();

    let forHome: boolean | null = null;
    if (homeFlag === 'yes') forHome = !isOwn;
    else if (homeFlag === 'no') forHome = isOwn;
    else if (homeTeamName && team && team.includes(homeTeamName.toLowerCase().slice(0, 5))) {
      forHome = !isOwn;
    } else if (awayTeamName && team && team.includes(awayTeamName.toLowerCase().slice(0, 5))) {
      forHome = isOwn;
    }

    if (forHome == null) continue;
    if (forHome) home += 1;
    else away += 1;
    counted += 1;
  }

  if (!counted) return null;
  return { homeScore: home, awayScore: away };
}

export function classifyPhase(
  status: string | null | undefined,
  hasScore: boolean,
  scrapeIsLive?: boolean,
  timelineHasLiveEvents?: boolean
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
    timelineHasLiveEvents ||
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
  const byKey = new Map<string, { name: string; home: string; away: string; key: string }>();

  for (const r of rows) {
    if (!r.strStat) continue;
    const key = r.strStat.trim().toLowerCase();
    byKey.set(key, {
      key,
      name: translateStatName(r.strStat),
      home: formatStatValue(r.strStat, r.intHome),
      away: formatStatValue(r.strStat, r.intAway),
    });
  }

  // Garantizar métricas clave aunque la API no las mande
  const existingKeys = Array.from(byKey.keys());
  for (const p of PRIORITY_STAT_KEYS) {
    if (!existingKeys.some((k) => k === p || k.includes(p))) {
      byKey.set(p, {
        key: p,
        name: translateStatName(p),
        home: '—',
        away: '—',
      });
    }
  }

  const all = Array.from(byKey.values());
  all.sort((a, b) => {
    const pa = isPriorityStat(a.key) ? 0 : 1;
    const pb = isPriorityStat(b.key) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    const order = PRIORITY_STAT_KEYS as readonly string[];
    const ia = order.findIndex((k) => a.key === k || a.key.includes(k));
    const ib = order.findIndex((k) => b.key === k || b.key.includes(k));
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return all;
}

function formatStatValue(statName: string, raw: string | null | undefined): string {
  if (raw == null || raw === '') return '—';
  const key = statName.toLowerCase();
  if (key.includes('possession') || key.includes('accuracy')) {
    return raw.includes('%') ? raw : `${raw}%`;
  }
  return raw;
}

function mapTimeline(rows: SportsDbTimelineItem[]) {
  return rows.map((r) => ({
    minute: r.intTime ?? '—',
    type: translateTimelineType(r.strTimeline ?? ''),
    detail: translateTimelineDetail(r.strTimelineDetail ?? ''),
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

function mergeScores(
  fromEvent: { homeScore: number | null; awayScore: number | null; score: string | null },
  fromTl: { homeScore: number; awayScore: number } | null
): {
  homeScore: number | null;
  awayScore: number | null;
  score: string | null;
  scoreFromTimeline: boolean;
} {
  if (!fromTl) {
    return { ...fromEvent, scoreFromTimeline: false };
  }
  // Máximo por equipo: la cronología suele ir más al día que lookupevent
  const homeScore = Math.max(fromEvent.homeScore ?? 0, fromTl.homeScore);
  const awayScore = Math.max(fromEvent.awayScore ?? 0, fromTl.awayScore);
  const scoreFromTimeline =
    fromEvent.homeScore == null ||
    fromEvent.awayScore == null ||
    homeScore !== fromEvent.homeScore ||
    awayScore !== fromEvent.awayScore;
  return {
    homeScore,
    awayScore,
    score: `${homeScore}-${awayScore}`,
    scoreFromTimeline,
  };
}

/**
 * Carga marcador + stats + timeline (free).
 * includeDetails=false → marcador/status (+ timeline corta para sincronizar goles).
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
  let eventScores = parseScore(event);
  const status = event?.strStatus ?? null;

  let stats: MatchStatusPayload['stats'] = [];
  let timeline: MatchStatusPayload['timeline'] = [];
  let rawTl: SportsDbTimelineItem[] = [];
  let scoreFromTimeline = false;

  // Siempre pedir timeline si hay evento: sincroniza goles aunque lookupevent vaya tarde
  if (event?.idEvent) {
    const bypass = true; // live/FT: nunca servir caché vieja de marcador
    rawTl = await lookupEventTimeline(event.idEvent, { bypassCache: bypass });
    timeline = mapTimeline(rawTl);

    const tlScore = scoreFromTimelineGoals(rawTl, event.strHomeTeam, event.strAwayTeam);
    const merged = mergeScores(eventScores, tlScore);
    eventScores = {
      score: merged.score,
      homeScore: merged.homeScore,
      awayScore: merged.awayScore,
    };
    scoreFromTimeline = merged.scoreFromTimeline;
    if (scoreFromTimeline) {
      notes.push('Marcador sincronizado con goles de la cronología (más actualizado).');
    }

    const hasGoalEvents = rawTl.some((r) => {
      const t = (r.strTimeline ?? '').toLowerCase();
      const d = (r.strTimelineDetail ?? '').toLowerCase();
      return t === 'goal' || d.includes('goal') || d === 'penalty';
    });

    let phase = classifyPhase(
      status,
      Boolean(eventScores.score),
      input.scrapeIsLive,
      hasGoalEvents && status?.toUpperCase() !== 'FT'
    );

    // Si hay goles y no es FT, forzar live
    if (hasGoalEvents && phase === 'scheduled') phase = 'live';
    if (hasGoalEvents && !status && phase !== 'finished') phase = 'live';

    if (includeDetails && (phase === 'live' || phase === 'finished' || hasGoalEvents)) {
      const rawStats = await lookupEventStats(event.idEvent, { bypassCache: bypass });
      stats = mapStats(rawStats);
      if (!rawStats.length) {
        notes.push('Sin estadísticas detalladas aún (o no disponibles en free).');
      }
    } else if (phase === 'scheduled') {
      notes.push('Partido aún no iniciado: no hay stats en vivo.');
    }

    if (!timeline.length && (phase === 'live' || phase === 'finished')) {
      notes.push('Sin cronología de eventos aún.');
    }

    return {
      source: 'thesportsdb',
      phase,
      eventId: event.idEvent ?? null,
      label: event.strEvent ?? null,
      league: event.strLeague ?? null,
      date: event.dateEvent ?? input.matchDateYmd ?? null,
      status,
      statusLabel: translateMatchStatus(status),
      progress: event.strProgress ?? null,
      score: eventScores.score,
      homeScore: eventScores.homeScore,
      awayScore: eventScores.awayScore,
      scoreFromTimeline,
      homeTeam: event.strHomeTeam ?? input.homeTeam ?? null,
      awayTeam: event.strAwayTeam ?? input.awayTeam ?? null,
      venue: event.strVenue ?? null,
      stats,
      timeline,
      notes,
      fetchedAt: new Date().toISOString(),
    };
  }

  const phase = classifyPhase(status, Boolean(eventScores.score), input.scrapeIsLive);
  return {
    source: 'thesportsdb',
    phase,
    eventId: null,
    label: null,
    league: null,
    date: input.matchDateYmd ?? null,
    status,
    statusLabel: translateMatchStatus(status),
    progress: null,
    score: eventScores.score,
    homeScore: eventScores.homeScore,
    awayScore: eventScores.awayScore,
    scoreFromTimeline: false,
    homeTeam: input.homeTeam ?? null,
    awayTeam: input.awayTeam ?? null,
    venue: null,
    stats,
    timeline,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}
