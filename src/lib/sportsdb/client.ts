/**
 * Cliente TheSportsDB — SOLO Free Sports API (V1).
 * - Clave demo pública: `123` en la URL (no hace falta suscripción)
 * - NO usamos V2 ni header X-API-KEY (eso es de pago)
 * - Rate limit ~25/min · caché 6h
 * - Scrapers NO deben usar esto; solo análisis
 * Docs: https://www.thesportsdb.com/documentation
 * Ejemplos: https://www.thesportsdb.com/docs_api_examples
 */

const BASE = 'https://www.thesportsdb.com/api/v1/json';

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

const requestTimestamps: number[] = [];
const MAX_PER_MINUTE = 25;

/** Free demo key. Env opcional; nunca V2 premium. */
function apiKey(): string {
  const k = process.env.THESPORTSDB_API_KEY?.trim();
  if (!k || k === 'xxxxxx' || k.length > 40) return '123';
  return k;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function respectRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] > 60_000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= MAX_PER_MINUTE) {
    const wait = 60_000 - (now - requestTimestamps[0]) + 50;
    await sleep(Math.max(wait, 200));
  }
  requestTimestamps.push(Date.now());
}

export async function sportsDbFetch<T = unknown>(
  path: string,
  params: Record<string, string> = {},
  opts?: { bypassCache?: boolean }
): Promise<T | null> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/${apiKey()}/${path}${qs ? `?${qs}` : ''}`;
  const cacheKey = url;

  if (!opts?.bypassCache) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.data as T;
    }
  }

  await respectRateLimit();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 0 },
    });
    if (res.status === 429) {
      await sleep(65_000);
      return sportsDbFetch(path, params, { bypassCache: true });
    }
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    cache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}

export type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  strTeamShort?: string;
  strLeague?: string;
  strSport?: string;
  strBadge?: string;
  strCountry?: string;
};

export type SportsDbEvent = {
  idEvent?: string;
  strEvent?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  dateEvent?: string;
  dateEventLocal?: string | null;
  strLeague?: string;
  strSport?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strStatus?: string | null;
  strProgress?: string | null;
  strVenue?: string | null;
  /** Hora UTC (free V1), p.ej. 19:00:00 */
  strTime?: string | null;
  /** Hora local del venue, p.ej. 14:00:00 */
  strTimeLocal?: string | null;
  /** Instantáneo UTC sin Z, p.ej. 2026-07-14T19:00:00 */
  strTimestamp?: string | null;
  strHomeTeamBadge?: string | null;
  strAwayTeamBadge?: string | null;
};

export type SportsDbEventStat = {
  idStatistic?: string;
  idEvent?: string;
  strStat?: string;
  intHome?: string | null;
  intAway?: string | null;
};

export type SportsDbTimelineItem = {
  idTimeline?: string;
  idEvent?: string;
  strTimeline?: string;
  strTimelineDetail?: string;
  strHome?: string;
  strPlayer?: string;
  strAssist?: string;
  intTime?: string;
  strTeam?: string;
  strComment?: string | null;
};

type TeamsResponse = { teams: SportsDbTeam[] | null };
type EventsResponse = { event: SportsDbEvent[] | null; results?: SportsDbEvent[] | null };
type EventStatsResponse = { eventstats: SportsDbEventStat[] | null };
type TimelineResponse = { timeline: SportsDbTimelineItem[] | null };

export function normalizeTeamQuery(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|ac|afc|club|de|the)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function teamNameSimilarity(a: string, b: string): number {
  const na = normalizeTeamQuery(a).toLowerCase();
  const nb = normalizeTeamQuery(b).toLowerCase();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(' ').filter((w) => w.length > 2));
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  Array.from(ta).forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  return inter / Math.max(ta.size, tb.size);
}

/** Busca equipo (caché). En free key, searchteams está muy limitado; aún así intentamos. */
export async function searchTeam(name: string): Promise<SportsDbTeam | null> {
  const q = normalizeTeamQuery(name);
  if (q.length < 3) return null;
  const data = await sportsDbFetch<TeamsResponse>('searchteams.php', { t: q });
  const teams = data?.teams ?? [];
  if (!teams.length) return null;
  return (
    [...teams].sort(
      (a, b) => teamNameSimilarity(name, b.strTeam) - teamNameSimilarity(name, a.strTeam)
    )[0] ?? null
  );
}

export async function lookupTeam(id: string): Promise<SportsDbTeam | null> {
  const data = await sportsDbFetch<TeamsResponse>('lookupteam.php', { id });
  return data?.teams?.[0] ?? null;
}

/** Últimos resultados del equipo (eventslast). */
export async function lastEventsForTeam(teamId: string): Promise<SportsDbEvent[]> {
  const data = await sportsDbFetch<EventsResponse>('eventslast.php', { id: teamId });
  return data?.results ?? data?.event ?? [];
}

/**
 * Eventos del día (1 request reutilizable vía caché para todos los análisis del día).
 * Ideal para cruzar con partidos scrapeados sin searchteams.
 */
export async function eventsOnDay(dateYmd: string, sport?: string): Promise<SportsDbEvent[]> {
  const params: Record<string, string> = { d: dateYmd };
  if (sport) params.s = sport;
  const data = await sportsDbFetch<EventsResponse>('eventsday.php', params);
  return data?.event ?? [];
}

export async function searchEvent(home: string, away: string): Promise<SportsDbEvent | null> {
  const e = `${normalizeTeamQuery(home).replace(/\s+/g, '_')}_vs_${normalizeTeamQuery(away).replace(/\s+/g, '_')}`;
  const data = await sportsDbFetch<EventsResponse>('searchevents.php', { e });
  const events = data?.event ?? [];
  if (!events.length) return null;
  return (
    [...events].sort((a, b) => {
      const sa =
        teamNameSimilarity(home, a.strHomeTeam ?? '') +
        teamNameSimilarity(away, a.strAwayTeam ?? '');
      const sb =
        teamNameSimilarity(home, b.strHomeTeam ?? '') +
        teamNameSimilarity(away, b.strAwayTeam ?? '');
      return sb - sa;
    })[0] ?? null
  );
}

/** Detalle de evento (marcador / status). Usar bypassCache en live. */
export async function lookupEvent(
  eventId: string,
  opts?: { bypassCache?: boolean }
): Promise<SportsDbEvent | null> {
  const data = await sportsDbFetch<EventsResponse>(
    'lookupevent.php',
    { id: eventId },
    opts
  );
  return data?.event?.[0] ?? null;
}

/** Estadísticas del partido (tiros, posesión, etc.) — free V1. */
export async function lookupEventStats(
  eventId: string,
  opts?: { bypassCache?: boolean }
): Promise<SportsDbEventStat[]> {
  const data = await sportsDbFetch<EventStatsResponse>(
    'lookupeventstats.php',
    { id: eventId },
    opts
  );
  return data?.eventstats ?? [];
}

/** Timeline (goles, tarjetas, cambios) — free V1. */
export async function lookupEventTimeline(
  eventId: string,
  opts?: { bypassCache?: boolean }
): Promise<SportsDbTimelineItem[]> {
  const data = await sportsDbFetch<TimelineResponse>(
    'lookuptimeline.php',
    { id: eventId },
    opts
  );
  return data?.timeline ?? [];
}

export function findEventInDayList(
  events: SportsDbEvent[],
  home: string,
  away: string
): SportsDbEvent | null {
  let best: SportsDbEvent | null = null;
  let bestScore = 0;
  for (const ev of events) {
    const s =
      teamNameSimilarity(home, ev.strHomeTeam ?? '') +
      teamNameSimilarity(away, ev.strAwayTeam ?? '');
    const sSwap =
      teamNameSimilarity(home, ev.strAwayTeam ?? '') +
      teamNameSimilarity(away, ev.strHomeTeam ?? '');
    const score = Math.max(s, sSwap);
    if (score > bestScore) {
      bestScore = score;
      best = ev;
    }
  }
  return bestScore >= 1.2 ? best : null;
}

export function sportApiLabel(sportKind?: string): string | undefined {
  const map: Record<string, string> = {
    football: 'Soccer',
    basketball: 'Basketball',
    tennis: 'Tennis',
    hockey: 'Ice Hockey',
    baseball: 'Baseball',
    american_football: 'American Football',
    volleyball: 'Volleyball',
    rugby: 'Rugby',
    cricket: 'Cricket',
    golf: 'Golf',
    handball: 'Handball',
    mma: 'Fighting',
  };
  return sportKind ? map[sportKind] : undefined;
}
