/**
 * Cliente football-data.org v4 (plan free: 10 req/min, ~12 competiciones).
 * Docs: https://www.football-data.org/documentation/quickstart
 * Auth: header X-Auth-Token (FOOTBALL_DATA_API_TOKEN).
 */

import { sameTeamIdentity } from '@/lib/team-identity';

const BASE = 'https://api.football-data.org/v4';

/** Competiciones típicas del plan free (codes). */
export const FREE_COMPETITION_CODES = [
  'PL', // Premier League
  'PD', // La Liga
  'BL1', // Bundesliga
  'SA', // Serie A
  'FL1', // Ligue 1
  'CL', // Champions League
  'DED', // Eredivisie
  'PPL', // Primeira Liga
  'ELC', // Championship
  'BSA', // Brasileirão
  'WC', // World Cup
  'EC', // European Championship
] as const;

export type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday?: number | null;
  stage?: string | null;
  homeTeam?: { id?: number; name?: string; shortName?: string; tla?: string };
  awayTeam?: { id?: number; name?: string; shortName?: string; tla?: string };
  score?: {
    fullTime?: { home?: number | null; away?: number | null };
    halfTime?: { home?: number | null; away?: number | null };
  };
  competition?: { name?: string; code?: string };
  /** Presente en varios endpoints v4 cuando hay asignación */
  referees?: Array<{ id?: number; name?: string; type?: string; nationality?: string | null }>;
};

export function primaryRefereeName(m: FdMatch | null | undefined): string | null {
  const list = m?.referees ?? [];
  const main =
    list.find((r) => /referee|main|principal/i.test(r.type ?? '')) ?? list[0];
  const name = main?.name?.trim();
  return name && name.length > 1 ? name : null;
}

export type FdStandingRow = {
  position: number;
  team: { id?: number; name?: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string | null;
};

export type FdTeamMatches = {
  matches: FdMatch[];
};

type CacheEntry = { at: number; data: unknown };
const memCache = new Map<string, CacheEntry>();
const CACHE_MS = 60_000; // 1 min — respeta cuota free

let lastRequestAt = 0;
const MIN_GAP_MS = 6_500; // ~9 req/min con margen bajo el límite de 10/min

function token(): string | null {
  const t = process.env.FOOTBALL_DATA_API_TOKEN?.trim();
  return t && t.length > 8 ? t : null;
}

export function isFootballDataConfigured(): boolean {
  return Boolean(token());
}

async function throttle() {
  const wait = MIN_GAP_MS - (Date.now() - lastRequestAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

async function fdGet<T>(path: string, init?: RequestInit): Promise<T> {
  const key = token();
  if (!key) throw new Error('FOOTBALL_DATA_API_TOKEN no configurado');

  const cacheKey = path;
  const hit = memCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;

  await throttle();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'X-Auth-Token': key,
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 429) {
    throw new Error('football-data.org: rate limit (10/min en free). Reintenta en ~60s.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org ${res.status}: ${body.slice(0, 180)}`);
  }
  const data = (await res.json()) as T;
  memCache.set(cacheKey, { at: Date.now(), data });
  return data;
}

/** Partidos de hoy (UTC) en competiciones del plan. */
export async function fetchTodaysMatches(): Promise<FdMatch[]> {
  const data = await fdGet<{ matches?: FdMatch[] }>('/matches');
  return data.matches ?? [];
}

/** Partidos de una competición (season actual). */
export async function fetchCompetitionMatches(
  code: string,
  status?: 'SCHEDULED' | 'FINISHED' | 'LIVE' | 'TIMED'
): Promise<FdMatch[]> {
  const q = status ? `?status=${status}` : '';
  const data = await fdGet<{ matches?: FdMatch[] }>(
    `/competitions/${encodeURIComponent(code)}/matches${q}`
  );
  return data.matches ?? [];
}

/** Clasificación (tabla) de una competición. */
export async function fetchStandings(code: string): Promise<FdStandingRow[]> {
  const data = await fdGet<{
    standings?: Array<{ type?: string; table?: FdStandingRow[] }>;
  }>(`/competitions/${encodeURIComponent(code)}/standings`);
  const total = data.standings?.find((s) => s.type === 'TOTAL') ?? data.standings?.[0];
  return total?.table ?? [];
}

/** Últimos / próximos partidos de un equipo por id. */
export async function fetchTeamMatches(
  teamId: number,
  status: 'FINISHED' | 'SCHEDULED' = 'FINISHED',
  limit = 15
): Promise<FdMatch[]> {
  const data = await fdGet<FdTeamMatches>(
    `/teams/${teamId}/matches?status=${status}&limit=${limit}`
  );
  return data.matches ?? [];
}

function teamMatch(a: string, b: string): boolean {
  return sameTeamIdentity(a, b);
}

function findTeamIdInDayMatches(teamName: string, matches: FdMatch[]): number | undefined {
  for (const m of matches) {
    if (teamMatch(m.homeTeam?.name ?? '', teamName)) return m.homeTeam?.id;
    if (teamMatch(m.awayTeam?.name ?? '', teamName)) return m.awayTeam?.id;
  }
  return undefined;
}

/**
 * Busca un partido de hoy/cerca que coincida con local/visitante.
 * Usa /matches (1 req) + opcional standings si hay code de liga.
 */
export async function findMatchContext(input: {
  homeTeam: string;
  awayTeam: string;
  leagueHint?: string;
}): Promise<{
  match: FdMatch | null;
  standingsHome: FdStandingRow | null;
  standingsAway: FdStandingRow | null;
  recentHome: FdMatch[];
  recentAway: FdMatch[];
  notes: string[];
  usedRequests: number;
}> {
  const notes: string[] = [];
  let used = 0;
  if (!isFootballDataConfigured()) {
    return {
      match: null,
      standingsHome: null,
      standingsAway: null,
      recentHome: [],
      recentAway: [],
      notes: ['FOOTBALL_DATA_API_TOKEN ausente — se omite football-data.org'],
      usedRequests: 0,
    };
  }

  used += 1;
  let matches: FdMatch[] = [];
  try {
    matches = await fetchTodaysMatches();
    notes.push(`football-data.org: ${matches.length} partidos hoy (UTC).`);
  } catch (err) {
    notes.push(err instanceof Error ? err.message : 'Error /matches');
    return {
      match: null,
      standingsHome: null,
      standingsAway: null,
      recentHome: [],
      recentAway: [],
      notes,
      usedRequests: used,
    };
  }

  const hit =
    matches.find(
      (m) =>
        teamMatch(m.homeTeam?.name ?? '', input.homeTeam) &&
        teamMatch(m.awayTeam?.name ?? '', input.awayTeam)
    ) ??
    matches.find(
      (m) =>
        teamMatch(m.homeTeam?.name ?? '', input.awayTeam) &&
        teamMatch(m.awayTeam?.name ?? '', input.homeTeam)
    ) ??
    null;

  let standingsHome: FdStandingRow | null = null;
  let standingsAway: FdStandingRow | null = null;
  let recentHome: FdMatch[] = [];
  let recentAway: FdMatch[] = [];

  const code =
    hit?.competition?.code ??
    FREE_COMPETITION_CODES.find((c) =>
      (input.leagueHint ?? '').toUpperCase().includes(c)
    );

  if (hit && code) {
    try {
      used += 1;
      const table = await fetchStandings(code);
      const homeId = hit.homeTeam?.id;
      const awayId = hit.awayTeam?.id;
      standingsHome = table.find((r) => r.team.id === homeId) ?? null;
      standingsAway = table.find((r) => r.team.id === awayId) ?? null;
      notes.push(`Tabla ${code}: pos ${standingsHome?.position ?? '?'} vs ${standingsAway?.position ?? '?'}.`);
    } catch (err) {
      notes.push(err instanceof Error ? err.message : 'Error standings');
    }
  }

  // Forma reciente — hasta 2 req más si hay ids (exact hit o equipo en calendario de hoy)
  const homeTeamId = hit?.homeTeam?.id ?? findTeamIdInDayMatches(input.homeTeam, matches);
  const awayTeamId = hit?.awayTeam?.id ?? findTeamIdInDayMatches(input.awayTeam, matches);

  if (homeTeamId) {
    try {
      used += 1;
      recentHome = await fetchTeamMatches(homeTeamId, 'FINISHED', 15);
      notes.push(`Forma API local: ${recentHome.length} FT.`);
    } catch (err) {
      notes.push(err instanceof Error ? err.message : 'Error team home');
    }
  }
  if (awayTeamId) {
    try {
      used += 1;
      recentAway = await fetchTeamMatches(awayTeamId, 'FINISHED', 15);
      notes.push(`Forma API visitante: ${recentAway.length} FT.`);
    } catch (err) {
      notes.push(err instanceof Error ? err.message : 'Error team away');
    }
  }
  if (!hit && !homeTeamId && !awayTeamId) {
    notes.push('Sin partido exacto en /matches de hoy para este par.');
  } else if (!hit && (homeTeamId || awayTeamId)) {
    notes.push('Forma vía equipo en calendario de hoy (sin H2H exacto en /matches).');
  }

  return {
    match: hit,
    standingsHome,
    standingsAway,
    recentHome,
    recentAway,
    notes,
    usedRequests: used,
  };
}

export function scoreOf(m: FdMatch): string | null {
  const h = m.score?.fullTime?.home;
  const a = m.score?.fullTime?.away;
  if (h == null || a == null) return null;
  return `${h}-${a}`;
}
