/**
 * SportScore (RapidAPI): eventos v1 + widget equipos v6.
 * - POST sportscore1…/events/search
 * - GET  sportscore6…/api/widget/team/?sport=football
 */

import { CACHE_POLICIES } from '@/lib/analysis/contracts';
import { getApiCacheStore } from '@/lib/cache/api-cache-store';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import { RAPIDAPI_HOSTS } from '@/lib/rapidapi/hosts';
import { isRapidApiConfigured, rapidApiGet, rapidApiPost } from '@/lib/rapidapi/http';
import crypto from 'crypto';

export type SportScoreEventHit = {
  eventId: string | number | null;
  homeTeam: string;
  awayTeam: string;
  status: string | null;
  startTime: string | null;
  scoreHome: number | null;
  scoreAway: number | null;
  league: string | null;
  venue: string | null;
  source: 'rapidapi_sportscore1';
};

export type SportScoreTeamHit = {
  teamId: number | null;
  name: string;
  sport: string;
  league: string | null;
  logoUrl: string | null;
  source: 'rapidapi_sportscore6';
};

export type SportScoreMatchEnrichment = {
  events: SportScoreEventHit[];
  homeTeamProfile: SportScoreTeamHit | null;
  awayTeamProfile: SportScoreTeamHit | null;
};

function cacheKey(prefix: string, raw: string): string {
  const hash = crypto.createHash('sha256').update(raw.toLowerCase()).digest('hex').slice(0, 16);
  return `rapidapi:${prefix}:${hash}`;
}

function teamHit(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (na.length < 4 || nb.length < 4) return na === nb;
  return na.includes(nb.slice(0, 5)) || nb.includes(na.slice(0, 5));
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function pickTeamName(obj: Record<string, unknown>, side: 'home' | 'away'): string | null {
  const nested = obj[`${side}_team`] as Record<string, unknown> | undefined;
  return (
    str(nested?.name) ??
    str(nested?.title) ??
    str(obj[`${side}_team_name`]) ??
    str(obj[`${side}Team`]) ??
    str(obj[side === 'home' ? 'home' : 'away'])
  );
}

function mapEvent(row: Record<string, unknown>): SportScoreEventHit | null {
  const home =
    pickTeamName(row, 'home') ??
    str((row.participants as Record<string, unknown>[] | undefined)?.[0]?.name);
  const away =
    pickTeamName(row, 'away') ??
    str((row.participants as Record<string, unknown>[] | undefined)?.[1]?.name);
  if (!home || !away) return null;

  const leagueObj = row.league as Record<string, unknown> | undefined;
  const venueObj = row.venue as Record<string, unknown> | undefined;
  const score = row.score as Record<string, unknown> | undefined;

  return {
    eventId: num(row.id) ?? num(row.event_id) ?? str(row.id),
    homeTeam: home,
    awayTeam: away,
    status: str(row.status) ?? str(row.state),
    startTime:
      str(row.start_time) ??
      str(row.start_date) ??
      str(row.date) ??
      str(row.datetime),
    scoreHome: num(score?.home) ?? num(row.home_score) ?? num(row.score_home),
    scoreAway: num(score?.away) ?? num(row.away_score) ?? num(row.score_away),
    league: str(leagueObj?.name) ?? str(row.league_name) ?? str(row.competition),
    venue: str(venueObj?.name) ?? str(row.venue_name),
    source: 'rapidapi_sportscore1',
  };
}

function extractEventRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  for (const key of ['data', 'events', 'results', 'items', 'response']) {
    const val = o[key];
    if (Array.isArray(val)) return val as Record<string, unknown>[];
  }
  return [];
}

function extractTeamRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (!data || typeof data !== 'object') return [];
  const o = data as Record<string, unknown>;
  for (const key of ['data', 'teams', 'results', 'items', 'widget']) {
    const val = o[key];
    if (Array.isArray(val)) return val as Record<string, unknown>[];
  }
  return [];
}

function mapTeam(row: Record<string, unknown>, sport: string): SportScoreTeamHit | null {
  const name = str(row.name) ?? str(row.title) ?? str(row.team_name);
  if (!name) return null;
  const leagueObj = row.league as Record<string, unknown> | undefined;
  return {
    teamId: num(row.id) ?? num(row.team_id),
    name,
    sport,
    league: str(leagueObj?.name) ?? str(row.league_name) ?? str(row.league),
    logoUrl: str(row.logo) ?? str(row.logo_url) ?? str(row.image),
    source: 'rapidapi_sportscore6',
  };
}

function dateWindowYmd(centerYmd: string, days = 2): { start: string; end: string } {
  const center = new Date(`${centerYmd}T12:00:00Z`);
  const start = new Date(center);
  start.setUTCDate(start.getUTCDate() - days);
  const end = new Date(center);
  end.setUTCDate(end.getUTCDate() + days);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function fetchEventsRaw(input: {
  matchDateYmd: string;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}): Promise<SportScoreEventHit[]> {
  const { start, end } = dateWindowYmd(input.matchDateYmd);
  const q = new URLSearchParams({
    sport_id: '1',
    page: '1',
    date_start: start,
    date_end: end,
  });
  if (input.homeTeamId) q.set('home_team_id', String(input.homeTeamId));
  if (input.awayTeamId) q.set('away_team_id', String(input.awayTeamId));

  const data = await rapidApiPost<unknown>(
    RAPIDAPI_HOSTS.sportScore1,
    `/events/search?${q}`,
    'rapidapi_sportscore1'
  );
  return extractEventRows(data).map(mapEvent).filter(Boolean) as SportScoreEventHit[];
}

async function fetchFootballTeamsRaw(limit = 100): Promise<SportScoreTeamHit[]> {
  const q = new URLSearchParams({ sport: 'football', limit: String(limit) });
  const data = await rapidApiGet<unknown>(
    RAPIDAPI_HOSTS.sportScore6,
    `/api/widget/team/?${q}`,
    'rapidapi_sportscore6'
  );
  return extractTeamRows(data).map((r) => mapTeam(r, 'football')).filter(Boolean) as SportScoreTeamHit[];
}

function matchEventsForTeams(
  events: SportScoreEventHit[],
  homeTeam: string,
  awayTeam: string
): SportScoreEventHit[] {
  return events.filter(
    (e) =>
      (teamHit(e.homeTeam, homeTeam) && teamHit(e.awayTeam, awayTeam)) ||
      (teamHit(e.homeTeam, awayTeam) && teamHit(e.awayTeam, homeTeam))
  );
}

function findTeamProfile(teams: SportScoreTeamHit[], name: string): SportScoreTeamHit | null {
  return teams.find((t) => teamHit(t.name, name)) ?? null;
}

export async function enrichMatchFromSportScore(input: {
  homeTeam: string;
  awayTeam: string;
  matchDateYmd: string;
}): Promise<SportScoreMatchEnrichment> {
  const empty: SportScoreMatchEnrichment = {
    events: [],
    homeTeamProfile: null,
    awayTeamProfile: null,
  };
  if (!isRapidApiConfigured()) return empty;

  const cache = getApiCacheStore();
  const monitor = getApiHealthMonitor();
  const key = cacheKey('ss-match', `${input.matchDateYmd}|${input.homeTeam}|${input.awayTeam}`);

  return monitor.executeWithGracefulDegradation(
    'rapidapi_sportscore1',
    async () => {
      const result = await cache.getOrFetch({
        cacheKey: key,
        provider: 'rapidapi_sportscore1',
        policy: CACHE_POLICIES.teamStats,
        fetcher: async () => {
          let teams: SportScoreTeamHit[] = [];
          try {
            teams = await monitor.executeWithGracefulDegradation(
              'rapidapi_sportscore6',
              () => fetchFootballTeamsRaw(),
              []
            );
          } catch {
            teams = [];
          }

          const homeProfile = findTeamProfile(teams, input.homeTeam);
          const awayProfile = findTeamProfile(teams, input.awayTeam);

          let events = await fetchEventsRaw({
            matchDateYmd: input.matchDateYmd,
            homeTeamId: homeProfile?.teamId,
            awayTeamId: awayProfile?.teamId,
          });

          if (!events.length) {
            events = await fetchEventsRaw({ matchDateYmd: input.matchDateYmd });
          }

          const matched = matchEventsForTeams(events, input.homeTeam, input.awayTeam);

          return {
            events: matched.length ? matched : events.slice(0, 5),
            homeTeamProfile: homeProfile,
            awayTeamProfile: awayProfile,
          };
        },
      });
      return result.data;
    },
    empty
  );
}
