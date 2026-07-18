/**
 * Football Prediction API (RapidAPI v2).
 * GET /api/v2/predictions?market=classic&iso_date=...&federation=UEFA
 */

import { CACHE_POLICIES } from '@/lib/analysis/contracts';
import { getApiCacheStore } from '@/lib/cache/api-cache-store';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import { RAPIDAPI_HOSTS } from '@/lib/rapidapi/hosts';
import { isRapidApiConfigured, rapidApiGet } from '@/lib/rapidapi/http';
import crypto from 'crypto';

export type FootballPredictionHit = {
  homeTeam: string;
  awayTeam: string;
  market: string;
  federation: string | null;
  prediction: string | null;
  probHome: number | null;
  probDraw: number | null;
  probAway: number | null;
  startDate: string | null;
  source: 'rapidapi_football_prediction';
};

type RawPrediction = {
  home_team?: string;
  away_team?: string;
  start_date?: string;
  federation?: string;
  prediction?: string;
  probabilities?: Record<string, number | string>;
  prob_HW?: number | string;
  prob_D?: number | string;
  prob_AW?: number | string;
};

function cacheKey(dateYmd: string, home: string, away: string): string {
  const raw = `${dateYmd}|${home}|${away}`.toLowerCase();
  return `rapidapi:fp:${crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)}`;
}

function teamHit(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (na.length < 4 || nb.length < 4) return na === nb;
  return na.includes(nb.slice(0, 5)) || nb.includes(na.slice(0, 5));
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function mapRow(row: RawPrediction): FootballPredictionHit | null {
  const home = row.home_team?.trim();
  const away = row.away_team?.trim();
  if (!home || !away) return null;

  const probs = row.probabilities ?? {};
  const probHome =
    num(probs['1']) ?? num(probs.home) ?? num(row.prob_HW) ?? null;
  const probDraw = num(probs['X']) ?? num(probs.draw) ?? num(row.prob_D) ?? null;
  const probAway =
    num(probs['2']) ?? num(probs.away) ?? num(row.prob_AW) ?? null;

  return {
    homeTeam: home,
    awayTeam: away,
    market: 'classic',
    federation: row.federation ?? null,
    prediction: row.prediction ?? null,
    probHome,
    probDraw,
    probAway,
    startDate: row.start_date ?? null,
    source: 'rapidapi_football_prediction',
  };
}

async function fetchPredictionsRaw(
  dateYmd: string,
  federation = 'UEFA'
): Promise<FootballPredictionHit[]> {
  const q = new URLSearchParams({
    market: 'classic',
    iso_date: dateYmd,
    federation,
  });
  const data = await rapidApiGet<{ data?: RawPrediction[] } | RawPrediction[]>(
    RAPIDAPI_HOSTS.footballPrediction,
    `/api/v2/predictions?${q}`,
    'rapidapi_football_prediction'
  );
  const rows = Array.isArray(data) ? data : (data.data ?? []);
  return rows.map(mapRow).filter(Boolean) as FootballPredictionHit[];
}

export async function fetchFootballPredictionForMatch(input: {
  homeTeam: string;
  awayTeam: string;
  matchDateYmd: string;
  federation?: string;
}): Promise<FootballPredictionHit | null> {
  if (!isRapidApiConfigured()) return null;

  const cache = getApiCacheStore();
  const monitor = getApiHealthMonitor();
  const key = cacheKey(input.matchDateYmd, input.homeTeam, input.awayTeam);

  return monitor.executeWithGracefulDegradation(
    'rapidapi_football_prediction',
    async () => {
      const result = await cache.getOrFetch({
        cacheKey: key,
        provider: 'rapidapi_football_prediction',
        policy: CACHE_POLICIES.teamStats,
        fetcher: async () => {
          const list = await fetchPredictionsRaw(
            input.matchDateYmd,
            input.federation ?? 'UEFA'
          );
          const hit =
            list.find(
              (p) =>
                teamHit(p.homeTeam, input.homeTeam) && teamHit(p.awayTeam, input.awayTeam)
            ) ??
            list.find(
              (p) =>
                teamHit(p.homeTeam, input.awayTeam) && teamHit(p.awayTeam, input.homeTeam)
            );
          return hit ?? null;
        },
      });
      return result.data;
    },
    null
  );
}
