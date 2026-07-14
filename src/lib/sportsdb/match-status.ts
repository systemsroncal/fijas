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

/** true = local, false = visitante, null = desconocido */
function timelineSide(
  r: SportsDbTimelineItem,
  homeTeamName?: string | null,
  awayTeamName?: string | null
): boolean | null {
  const homeFlag = (r.strHome ?? '').toLowerCase();
  if (homeFlag === 'yes') return true;
  if (homeFlag === 'no') return false;

  const team = (r.strTeam ?? '').toLowerCase().trim();
  if (!team) return null;
  const home = (homeTeamName ?? '').toLowerCase();
  const away = (awayTeamName ?? '').toLowerCase();
  if (home && (team === home || team.includes(home) || home.includes(team))) return true;
  if (away && (team === away || team.includes(away) || away.includes(team))) return false;
  // fallback por prefijo corto (p.ej. France / Spain)
  if (home.length >= 4 && team.includes(home.slice(0, 4))) return true;
  if (away.length >= 4 && team.includes(away.slice(0, 4))) return false;
  return null;
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
    let forHome = timelineSide(r, homeTeamName, awayTeamName);
    if (forHome == null) continue;
    if (isOwn) forHome = !forHome;

    if (forHome) home += 1;
    else away += 1;
    counted += 1;
  }

  if (!counted) return null;
  return { homeScore: home, awayScore: away };
}

/** Tarjetas y tiros a puerta mínimos derivados de la cronología. */
export function deriveStatsFromTimeline(
  rows: SportsDbTimelineItem[],
  homeTeamName?: string | null,
  awayTeamName?: string | null
): {
  yellowHome: number;
  yellowAway: number;
  redHome: number;
  redAway: number;
  shotsOnGoalHome: number;
  shotsOnGoalAway: number;
} {
  let yellowHome = 0;
  let yellowAway = 0;
  let redHome = 0;
  let redAway = 0;
  let shotsOnGoalHome = 0;
  let shotsOnGoalAway = 0;

  for (const r of rows) {
    const type = (r.strTimeline ?? '').toLowerCase();
    const detail = (r.strTimelineDetail ?? '').toLowerCase();
    const side = timelineSide(r, homeTeamName, awayTeamName);
    if (side == null) continue;

    const isCard =
      type === 'card' || detail.includes('yellow') || detail.includes('red card');
    if (isCard) {
      const secondYellow = detail.includes('second yellow');
      const red = detail.includes('red') && !detail.includes('yellow');
      const yellow = detail.includes('yellow') || secondYellow;
      if (yellow) {
        if (side) yellowHome += 1;
        else yellowAway += 1;
      }
      if (red || secondYellow) {
        if (side) redHome += 1;
        else redAway += 1;
      }
    }

    // Gol / penalti = al menos 1 tiro a puerta del equipo que anota
    const isGoal =
      (type === 'goal' || detail.includes('normal goal') || detail === 'penalty') &&
      !detail.includes('missed') &&
      !detail.includes('own');
    if (isGoal) {
      if (side) shotsOnGoalHome += 1;
      else shotsOnGoalAway += 1;
    }
  }

  return {
    yellowHome,
    yellowAway,
    redHome,
    redAway,
    shotsOnGoalHome,
    shotsOnGoalAway,
  };
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

function isBlankStat(v: string | undefined): boolean {
  return !v || v === '—' || v === '-' || v === 'null';
}

function upsertStat(
  byKey: Map<string, { name: string; home: string; away: string; key: string }>,
  key: string,
  home: string,
  away: string,
  onlyIfBlank = false
) {
  const existing = byKey.get(key);
  if (existing) {
    if (onlyIfBlank) {
      byKey.set(key, {
        ...existing,
        home: isBlankStat(existing.home) ? home : existing.home,
        away: isBlankStat(existing.away) ? away : existing.away,
      });
    } else {
      // Preferir el mayor (API vs cronología)
      const h = Math.max(Number(existing.home) || 0, Number(home) || 0);
      const a = Math.max(Number(existing.away) || 0, Number(away) || 0);
      const useMax = !isBlankStat(existing.home) || !isBlankStat(home);
      byKey.set(key, {
        ...existing,
        home: useMax && !isBlankStat(home) ? String(h) : isBlankStat(existing.home) ? home : existing.home,
        away: useMax && !isBlankStat(away) ? String(a) : isBlankStat(existing.away) ? away : existing.away,
      });
    }
    return;
  }
  byKey.set(key, {
    key,
    name: translateStatName(key),
    home,
    away,
  });
}

function mapStats(
  rows: SportsDbEventStat[],
  timeline: SportsDbTimelineItem[],
  homeTeamName?: string | null,
  awayTeamName?: string | null
) {
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

  // Rellenar desde cronología: tarjetas y tiros a puerta (mínimo por goles)
  const derived = deriveStatsFromTimeline(timeline, homeTeamName, awayTeamName);
  upsertStat(
    byKey,
    'yellow cards',
    String(derived.yellowHome),
    String(derived.yellowAway),
    false
  );
  upsertStat(byKey, 'red cards', String(derived.redHome), String(derived.redAway), false);
  if (derived.shotsOnGoalHome + derived.shotsOnGoalAway > 0) {
    upsertStat(
      byKey,
      'shots on goal',
      String(derived.shotsOnGoalHome),
      String(derived.shotsOnGoalAway),
      true
    );
  }

  // Garantizar filas clave; posesión/córners pueden quedar — si la API no los manda
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

  // Unificar duplicados (yellow card / yellow cards)
  const yellowKeys = Array.from(byKey.keys()).filter((k) => k.includes('yellow'));
  if (yellowKeys.length > 1) {
    const primary = byKey.get('yellow cards') ?? byKey.get(yellowKeys[0])!;
    for (const k of yellowKeys) {
      if (k === 'yellow cards') continue;
      const other = byKey.get(k);
      if (!other) continue;
      upsertStat(byKey, 'yellow cards', other.home, other.away, false);
      byKey.delete(k);
    }
    byKey.set('yellow cards', {
      ...(byKey.get('yellow cards') ?? primary),
      key: 'yellow cards',
      name: translateStatName('yellow cards'),
    });
  }

  const all = Array.from(byKey.values()).filter((s) => {
    // Ocultar posesión/córners vacíos (no se pueden inferir de la cronología)
    if (
      (s.key.includes('possession') || s.key.includes('corner')) &&
      isBlankStat(s.home) &&
      isBlankStat(s.away)
    ) {
      return false;
    }
    return true;
  });

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

    if (includeDetails && (phase === 'live' || phase === 'finished' || hasGoalEvents || rawTl.length)) {
      const rawStats = await lookupEventStats(event.idEvent, { bypassCache: bypass });
      stats = mapStats(
        rawStats,
        rawTl,
        event.strHomeTeam ?? input.homeTeam,
        event.strAwayTeam ?? input.awayTeam
      );
      const cardsFilled = stats.some(
        (s) =>
          Boolean(s.key?.includes('yellow')) &&
          !isBlankStat(s.home) &&
          !isBlankStat(s.away)
      );
      if (cardsFilled) {
        notes.push('Tarjetas sincronizadas con la cronología.');
      } else if (!rawStats.length) {
        notes.push('Pocas estadísticas de la API; se usan eventos de la cronología.');
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
