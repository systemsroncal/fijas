/** Fuentes externas mostradas en el popup de análisis (scrapers + APIs). */

import type { SportKind } from '@/lib/match-display';

export const ANALYSIS_EXTERNAL_SOURCES = [
  { id: 'scrapers', name: 'Tips/cuotas scrapeados (BD)', cmd: 'load --from scrapers.db' },
  { id: 'predictz', name: 'Predictz / acumuladas', cmd: 'curl predictz.com/es/pronosticos…' },
  { id: 'windrawwin', name: 'WinDrawWin', cmd: 'fetch windrawwin.com/predictions/today' },
  { id: 'scores24', name: 'Scores24 (+ acumuladas ES)', cmd: 'fetch scores24.live/es/accumulators' },
  { id: 'scores365', name: '365Scores', cmd: 'fetch 365scores.com/es' },
  { id: 'flashscore', name: 'Flashscore', cmd: 'fetch flashscore.pe' },
  { id: 'sofascore', name: 'SofaScore', cmd: 'fetch sofascore.com/es' },
  { id: 'theanalyst', name: 'Opta Analyst', cmd: 'fetch theanalyst.com' },
  { id: 'cuotasahora', name: 'CuotasAhora', cmd: 'fetch cuotasahora.com' },
  { id: 'fbref', name: 'FBref matches', cmd: 'fetch fbref.com/en/matches' },
  { id: 'nba', name: 'NBA.com', cmd: 'fetch nba.com/scoreboard' },
  { id: 'nfl', name: 'NFL.com', cmd: 'fetch nfl.com/scores' },
  { id: 'espn_yahoo', name: 'ESPN / Yahoo Sports', cmd: 'fetch espn.com + yahoo sports' },
  { id: 'google_search', name: 'Búsquedas web (tips)', cmd: 'search --tips "predictions today"' },
  { id: 'h2h', name: 'H2H + forma temporada (BD)', cmd: 'query --h2h --season-form' },
  { id: 'football_data', name: 'football-data.org API', cmd: 'curl api.football-data.org/v4/matches -H X-Auth-Token' },
  { id: 'sportsdb', name: 'TheSportsDB (live/forma)', cmd: 'api thesportsdb.com' },
  { id: 'poisson', name: 'Red Neuronal (Poisson)', cmd: './model --poisson --deep' },
] as const;

/** Fuentes solo válidas para ciertos deportes (omitir = todas). */
const SOURCE_SPORTS: Partial<Record<(typeof ANALYSIS_EXTERNAL_SOURCES)[number]['id'], SportKind[]>> = {
  fbref: ['football', 'other'],
  football_data: ['football', 'other'],
  predictz: ['football', 'other'],
  windrawwin: ['football', 'other'],
  theanalyst: ['football', 'other'],
  nba: ['basketball'],
  nfl: ['american_football'],
};

/** Fuentes del popup filtradas por deporte del partido analizado. */
export function sourcesForSport(sport: SportKind) {
  return ANALYSIS_EXTERNAL_SOURCES.filter((src) => {
    const allowed = SOURCE_SPORTS[src.id];
    if (!allowed) return true;
    return allowed.includes(sport);
  });
}
