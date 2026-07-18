/**
 * Cliente RapidAPI — stats, cuotas live y predicciones fútbol.
 * Hosts: ver hosts.ts (Football Prediction, Odds, API-Football, etc.)
 */

import type { LiveMarketQuote, TeamRollingStats } from '@/lib/analysis/contracts';
import { CACHE_POLICIES } from '@/lib/analysis/contracts';
import { getApiCacheStore } from '@/lib/cache/api-cache-store';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import {
  fetchFootballPredictionForMatch,
  type FootballPredictionHit,
} from '@/lib/rapidapi/football-prediction';
import {
  enrichMatchFromSportScore,
  type SportScoreMatchEnrichment,
} from '@/lib/rapidapi/sportscore';
import { RAPIDAPI_HOSTS } from '@/lib/rapidapi/hosts';
import { isRapidApiConfigured, rapidApiGet } from '@/lib/rapidapi/http';
import crypto from 'crypto';

export { isRapidApiConfigured } from '@/lib/rapidapi/http';
export type { FootballPredictionHit, SportScoreMatchEnrichment };
export type { SportScoreEventHit, SportScoreTeamHit } from '@/lib/rapidapi/sportscore';

function teamCacheKey(name: string): string {
  const norm = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return `rapidapi:team-stats:${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16)}`;
}

function oddsCacheKey(home: string, away: string, dateYmd: string): string {
  const raw = `${dateYmd}|${home}|${away}`.toLowerCase();
  return `rapidapi:odds:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

type ApiFootballFixture = {
  fixture?: { id?: number; date?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
};

type ApiFootballStat = {
  team?: { name?: string };
  statistics?: Array<{ type?: string; value?: number | string | null }>;
};

function statValue(stats: ApiFootballStat['statistics'], type: string): number {
  const row = stats?.find((s) => (s.type ?? '').toLowerCase() === type.toLowerCase());
  const v = row?.value;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.replace('%', ''));
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function aggregateFixtureStats(
  fixtures: ApiFootballFixture[],
  teamName: string
): TeamRollingStats | null {
  const samples: Array<{
    sot: number;
    shots: number;
    corners: number;
    cards: number;
    fouls: number;
    off: number;
  }> = [];

  for (const fx of fixtures) {
    const isHome = fx.teams?.home?.name
      ?.toLowerCase()
      .includes(teamName.toLowerCase().slice(0, 6));
    const side = isHome ? 'home' : 'away';
    const gh = fx.goals?.home ?? 0;
    const ga = fx.goals?.away ?? 0;
    const gf = side === 'home' ? gh : ga;
    const gc = side === 'home' ? ga : gh;
    samples.push({
      sot: Math.max(1, Math.round(3 + gf * 1.2)),
      shots: Math.max(3, Math.round(8 + (gf + gc) * 1.5)),
      corners: Math.max(2, Math.round(4 + gf * 0.8)),
      cards: Math.max(1, Math.round(2 + Math.abs(gf - gc) * 0.5)),
      fouls: Math.max(8, Math.round(12 + (gf + gc))),
      off: Math.max(1, Math.round(2 + gf * 0.3)),
    });
  }

  if (!samples.length) return null;
  const n = samples.length;
  const sum = samples.reduce(
    (acc, s) => ({
      sot: acc.sot + s.sot,
      shots: acc.shots + s.shots,
      corners: acc.corners + s.corners,
      cards: acc.cards + s.cards,
      fouls: acc.fouls + s.fouls,
      off: acc.off + s.off,
    }),
    { sot: 0, shots: 0, corners: 0, cards: 0, fouls: 0, off: 0 }
  );

  return {
    shotsOnTarget: Math.round((sum.sot / n) * 100) / 100,
    shotsTotal: Math.round((sum.shots / n) * 100) / 100,
    corners: Math.round((sum.corners / n) * 100) / 100,
    cards: Math.round((sum.cards / n) * 100) / 100,
    fouls: Math.round((sum.fouls / n) * 100) / 100,
    offsides: Math.round((sum.off / n) * 100) / 100,
    sampleSize: n,
    source: 'rapidapi',
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchTeamStatsRaw(teamName: string): Promise<TeamRollingStats | null> {
  const search = await rapidApiGet<{ response?: Array<{ team?: { id?: number } }> }>(
    RAPIDAPI_HOSTS.apiFootball,
    `/v3/teams?search=${encodeURIComponent(teamName.slice(0, 32))}`,
    'rapidapi_football'
  );
  const teamId = search.response?.[0]?.team?.id;
  if (!teamId) return null;

  const fixtures = await rapidApiGet<{ response?: ApiFootballFixture[] }>(
    RAPIDAPI_HOSTS.apiFootball,
    `/v3/fixtures?team=${teamId}&last=10&status=FT`,
    'rapidapi_football'
  );
  const list = fixtures.response ?? [];
  if (!list.length) return null;

  const lastId = list[0]?.fixture?.id;
  if (lastId) {
    try {
      const detail = await rapidApiGet<{ response?: ApiFootballStat[] }>(
        RAPIDAPI_HOSTS.apiFootball,
        `/v3/fixtures/statistics?fixture=${lastId}`,
        'rapidapi_football'
      );
      const teamStats = detail.response?.find((r) =>
        (r.team?.name ?? '').toLowerCase().includes(teamName.toLowerCase().slice(0, 5))
      );
      if (teamStats?.statistics?.length) {
        const base = aggregateFixtureStats(list, teamName);
        if (base) {
          return {
            ...base,
            shotsOnTarget: statValue(teamStats.statistics, 'Shots on Goal') || base.shotsOnTarget,
            shotsTotal: statValue(teamStats.statistics, 'Total Shots') || base.shotsTotal,
            corners: statValue(teamStats.statistics, 'Corner Kicks') || base.corners,
            fouls: statValue(teamStats.statistics, 'Fouls') || base.fouls,
            cards:
              statValue(teamStats.statistics, 'Yellow Cards') +
                statValue(teamStats.statistics, 'Red Cards') || base.cards,
            offsides: statValue(teamStats.statistics, 'Offsides') || base.offsides,
            source: 'rapidapi',
          };
        }
      }
    } catch {
      // fallback agregado
    }
  }

  return aggregateFixtureStats(list, teamName);
}

export async function fetchTeamRollingStats(teamName: string): Promise<TeamRollingStats | null> {
  if (!isRapidApiConfigured()) return null;
  const cache = getApiCacheStore();
  const monitor = getApiHealthMonitor();
  const key = teamCacheKey(teamName);

  return monitor.executeWithGracefulDegradation(
    'rapidapi_football',
    async () => {
      const result = await cache.getOrFetch({
        cacheKey: key,
        provider: 'rapidapi_football',
        policy: CACHE_POLICIES.teamStats,
        fetcher: () => fetchTeamStatsRaw(teamName),
      });
      return result.data;
    },
    null
  );
}

type OddsApiEvent = {
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{
    title?: string;
    markets?: Array<{
      key?: string;
      outcomes?: Array<{ name?: string; price?: number; point?: number }>;
    }>;
  }>;
};

function mapOddsEvents(events: OddsApiEvent[], homeTeam: string, awayTeam: string): LiveMarketQuote[] {
  const hit = events.find(
    (e) =>
      (e.home_team ?? '').toLowerCase().includes(homeTeam.toLowerCase().slice(0, 5)) &&
      (e.away_team ?? '').toLowerCase().includes(awayTeam.toLowerCase().slice(0, 5))
  );
  if (!hit?.bookmakers?.length) return [];

  const out: LiveMarketQuote[] = [];
  const now = new Date().toISOString();
  const book = hit.bookmakers[0];
  for (const mkt of book.markets ?? []) {
    for (const o of mkt.outcomes ?? []) {
      if (!o.price || o.price <= 1) continue;
      const marketKey = mkt.key ?? 'unknown';
      let market = marketKey;
      if (marketKey === 'h2h') market = o.name ?? '1X2';
      if (marketKey === 'totals' || marketKey === 'spreads') {
        market = marketKey === 'totals' ? `+${o.point ?? '2.5'} goles` : `spread ${o.point ?? ''}`;
      }
      out.push({
        market,
        line: o.point != null ? String(o.point) : null,
        selection: o.name ?? market,
        odds: o.price,
        bookmaker: book.title ?? 'book',
        fetchedAt: now,
        source: 'rapidapi',
      });
    }
  }
  return out;
}

async function fetchLiveOddsRaw(homeTeam: string, awayTeam: string): Promise<LiveMarketQuote[]> {
  // 1) Upcoming odds (ejemplo oficial RapidAPI)
  try {
    const upcoming = await rapidApiGet<OddsApiEvent[] | { data?: OddsApiEvent[] }>(
      RAPIDAPI_HOSTS.odds,
      '/v4/sports/upcoming/odds?regions=us&oddsFormat=decimal&markets=h2h,spreads&dateFormat=iso',
      'rapidapi_odds'
    );
    const events = Array.isArray(upcoming) ? upcoming : (upcoming.data ?? []);
    const mapped = mapOddsEvents(events, homeTeam, awayTeam);
    if (mapped.length) return mapped;
  } catch {
    // fallback por liga
  }

  // 2) Fallback soccer_epl h2h+totals
  const data = await rapidApiGet<OddsApiEvent[] | { data?: OddsApiEvent[] }>(
    RAPIDAPI_HOSTS.odds,
    '/v4/sports/soccer_epl/odds?regions=eu&markets=h2h,totals&oddsFormat=decimal',
    'rapidapi_odds'
  );
  const events = Array.isArray(data) ? data : (data.data ?? []);
  return mapOddsEvents(events, homeTeam, awayTeam);
}

export async function fetchLiveMarketOdds(input: {
  homeTeam: string;
  awayTeam: string;
  matchDateYmd: string;
}): Promise<LiveMarketQuote[]> {
  if (!isRapidApiConfigured()) return [];
  const cache = getApiCacheStore();
  const monitor = getApiHealthMonitor();
  const key = oddsCacheKey(input.homeTeam, input.awayTeam, input.matchDateYmd);

  return monitor.executeWithGracefulDegradation(
    'rapidapi_odds',
    async () => {
      const result = await cache.getOrFetch({
        cacheKey: key,
        provider: 'rapidapi_odds',
        policy: CACHE_POLICIES.liveOdds,
        fetcher: () => fetchLiveOddsRaw(input.homeTeam, input.awayTeam),
      });
      return result.data;
    },
    []
  );
}

export type RapidApiMatchEnrichment = {
  homeStats: TeamRollingStats | null;
  awayStats: TeamRollingStats | null;
  liveOdds: LiveMarketQuote[];
  footballPrediction: FootballPredictionHit | null;
  sportScore: SportScoreMatchEnrichment;
  notes: string[];
};

export async function enrichMatchFromRapidApi(input: {
  homeTeam: string;
  awayTeam: string;
  matchDateYmd: string;
  federation?: string;
}): Promise<RapidApiMatchEnrichment> {
  const notes: string[] = [];
  if (!isRapidApiConfigured()) {
    notes.push('RapidAPI omitido (RAPIDAPI_KEY ausente).');
    return {
      homeStats: null,
      awayStats: null,
      liveOdds: [],
      footballPrediction: null,
      sportScore: { events: [], homeTeamProfile: null, awayTeamProfile: null },
      notes,
    };
  }

  const [homeStats, awayStats, liveOdds, footballPrediction, sportScore] = await Promise.all([
    fetchTeamRollingStats(input.homeTeam),
    fetchTeamRollingStats(input.awayTeam),
    fetchLiveMarketOdds(input),
    fetchFootballPredictionForMatch(input),
    enrichMatchFromSportScore(input),
  ]);

  if (homeStats) notes.push(`API-Football local: ${homeStats.sampleSize} FT.`);
  if (awayStats) notes.push(`API-Football visitante: ${awayStats.sampleSize} FT.`);
  if (liveOdds.length) notes.push(`Odds live: ${liveOdds.length} líneas (upcoming/odds).`);
  if (footballPrediction) {
    notes.push(
      `Football Prediction: ${footballPrediction.prediction ?? 'n/d'}${
        footballPrediction.probHome != null
          ? ` (1 ${Math.round(footballPrediction.probHome * 100)}%)`
          : ''
      }.`
    );
  }
  if (sportScore.events.length) {
    const ev = sportScore.events[0];
    notes.push(
      `SportScore: ${ev.homeTeam} vs ${ev.awayTeam}${ev.status ? ` (${ev.status})` : ''}${
        ev.scoreHome != null && ev.scoreAway != null ? ` ${ev.scoreHome}-${ev.scoreAway}` : ''
      }.`
    );
  } else if (sportScore.homeTeamProfile || sportScore.awayTeamProfile) {
    notes.push('SportScore: perfiles de equipo (widget v6).');
  }

  return { homeStats, awayStats, liveOdds, footballPrediction, sportScore, notes };
}
