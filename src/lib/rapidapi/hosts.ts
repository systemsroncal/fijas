/**
 * Hosts RapidAPI soportados (según ejemplos oficiales).
 * Auth: RAPIDAPI_KEY + X-RapidAPI-Host por request.
 */

export const RAPIDAPI_HOSTS = {
  /** API-Football (stats/fixtures) — host configurable */
  apiFootball:
    process.env.RAPIDAPI_FOOTBALL_HOST?.trim() || 'api-football-v1.p.rapidapi.com',
  /** Football Prediction API v2 */
  footballPrediction: 'football-prediction-api.p.rapidapi.com',
  /** Live Sports Odds (The Odds API vía RapidAPI) */
  odds: process.env.RAPIDAPI_ODDS_HOST?.trim() || 'odds.p.rapidapi.com',
  /** SportsPage Feeds (rankings multi-deporte) */
  sportsPageFeeds: 'sportspage-feeds.p.rapidapi.com',
  /** LiveScore6 (noticias/listados) */
  liveScore: 'livescore6.p.rapidapi.com',
  /** TheRundown (odds US / multi) */
  theRundown: 'therundown-therundown-v1.p.rapidapi.com',
  /** Free NBA (equipos/stats NBA) */
  freeNba: 'free-nba.p.rapidapi.com',
  /** SportScore v1 — búsqueda de eventos (POST /events/search) */
  sportScore1: 'sportscore1.p.rapidapi.com',
  /** SportScore v6 — widget equipos por deporte */
  sportScore6: 'sportscore6.p.rapidapi.com',
} as const;

export type RapidApiHostKey = keyof typeof RAPIDAPI_HOSTS;

/** IDs de circuit breaker / health monitor por host RapidAPI */
export type RapidApiProviderId =
  | 'rapidapi_football'
  | 'rapidapi_football_prediction'
  | 'rapidapi_odds'
  | 'rapidapi_sportspage'
  | 'rapidapi_livescore'
  | 'rapidapi_therundown'
  | 'rapidapi_nba'
  | 'rapidapi_sportscore1'
  | 'rapidapi_sportscore6';

export const RAPIDAPI_PROVIDER_LABELS: Record<RapidApiProviderId, string> = {
  rapidapi_football: 'RapidAPI API-Football',
  rapidapi_football_prediction: 'RapidAPI Football Prediction',
  rapidapi_odds: 'RapidAPI Live Odds',
  rapidapi_sportspage: 'RapidAPI SportsPage Feeds',
  rapidapi_livescore: 'RapidAPI LiveScore',
  rapidapi_therundown: 'RapidAPI TheRundown',
  rapidapi_nba: 'RapidAPI Free NBA',
  rapidapi_sportscore1: 'RapidAPI SportScore Events',
  rapidapi_sportscore6: 'RapidAPI SportScore Teams',
};
