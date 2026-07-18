/**
 * Tipos compartidos del análisis estructurado (seguros para cliente).
 */

export type TeamRollingStats = {
  shotsOnTarget: number;
  shotsTotal: number;
  corners: number;
  cards: number;
  fouls: number;
  offsides: number;
  sampleSize: number;
  source: 'rapidapi' | 'sportsdb' | 'database' | 'proxy';
  fetchedAt?: string;
};

export type LiveMarketQuote = {
  market: string;
  line: string | null;
  selection: string;
  odds: number;
  bookmaker: string;
  fetchedAt: string;
  source: 'rapidapi' | 'scrape' | 'implied';
};

export type AnalysisMarket = {
  market: string;
  line: string | null;
  odds: number;
  aiProb: number;
  edge: number;
  verdict: 'value' | 'safe' | 'risky' | 'avoid' | 'neutral';
  /** model = Poisson; book = cuota de casa scrapeada; implied = cuota derivada del modelo (no es casa) */
  source: 'model' | 'estimated' | 'book' | 'implied';
};

export type AnalysisPick = {
  market: string;
  odds: number;
  aiProb: number;
  rationale: string;
};

export type ProposedAccumulator = {
  title: string;
  riskTier: 'safe' | 'value' | 'risky';
  totalOdds: number;
  legs: Array<{
    matchId?: string;
    matchLabel: string;
    market: string;
    betChoice: string;
    odds: number;
  }>;
};

export type FormMatchRow = {
  matchId: string;
  label: string;
  date: string;
  score: string | null;
  tip: string | null;
  league?: string | null;
};

export type TeamRecentFormStats = {
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  sampleSize: number;
};

export type TeamFormBlock = {
  available: boolean;
  message: string;
  recentScores: string[];
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  avgGoalsTotal: number | null;
  cardsTotal: number | null;
  avgCards: number | null;
  sampleSize: number;
  rows: FormMatchRow[];
  /** Enfrentamientos directos (H2H) con marcador real */
  h2h?: FormMatchRow[];
  /** Forma reciente del local en temporada/torneo */
  homeSeason?: FormMatchRow[];
  /** Forma reciente del visitante en temporada/torneo */
  awaySeason?: FormMatchRow[];
  /** Resumen forma local (últimos partidos, sin H2H) */
  homeForm?: TeamRecentFormStats | null;
  /** Resumen forma visitante (últimos partidos, sin H2H) */
  awayForm?: TeamRecentFormStats | null;
};

/** Intento de IA durante el análisis (para el popup en vivo). */
export type AiAttemptLog = {
  provider: string;
  status: 'trying' | 'ok' | 'fail' | 'skip';
  detail?: string;
};

export type AnalysisProgressEvent = {
  type: 'progress' | 'done' | 'error';
  step?: string;
  message: string;
  source?: string;
  provider?: string;
  ok?: boolean;
  pct?: number;
  analysis?: unknown;
  payload?: unknown;
  aiAttempts?: AiAttemptLog[];
};

export type RelatedMatchRow = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  tip?: string | null;
};

export type AnalysisBrief = {
  headline: string;
  bullets: string[];
  dataSources: string[];
  limitations: string[];
};

/** Perfil arbitral (API, LLM o inferido; nunca inventar nombre sin fuente). */
export type AnalysisReferee = {
  name: string | null;
  style: 'strict' | 'lenient' | 'balanced' | 'unknown';
  cardsTendency: 'high' | 'low' | 'avg' | 'unknown';
  notes: string;
  source: 'api' | 'llm' | 'inferred' | 'none';
};

export type AnalysisAbsence = {
  player: string;
  reason: string;
  impact: 'high' | 'medium' | 'low';
};

export type AnalysisScenario = {
  id: string;
  label: string;
  assumptions: string;
  impactSummary: string;
  /** Desplazamientos en puntos % sobre 1X2 del escenario base */
  probShifts: { home: number; draw: number; away: number };
  focusMarkets: string[];
};

export type StructuredMatchPayload = {
  mode: 'MATCH' | 'RANDOM' | 'ACCUMULATOR';
  match?: {
    id?: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    tip?: string | null;
    sport?: string;
    homeCrestUrl?: string | null;
    awayCrestUrl?: string | null;
    /** Fecha programada del partido (YYYY-MM-DD) */
    matchDate?: string | null;
  };
  /** Meta de combinada (cuando mode = ACCUMULATOR) */
  accumulatorMeta?: {
    name: string;
    totalOdds: number;
    resolvedLegs: Array<{
      matchId?: string;
      matchLabel: string;
      market: string;
      odds: number;
      aiProb: number;
      liveScore?: string | null;
      livePhase?: string | null;
    }>;
    /** Contexto live/FT usado al analizar la combinada */
    liveContext?: Array<{
      matchId?: string;
      label: string;
      score: string | null;
      phase: string;
      statusLabel?: string | null;
      note?: string;
    }>;
  };
  probs: { home: number; draw: number; away: number };
  /** Poisson puro antes de mezclar cuotas */
  poissonProbs?: { home: number; draw: number; away: number } | null;
  /** Implícitas normalizadas desde cuotas scrapeadas */
  marketImplied?: { home: number; draw: number; away: number } | null;
  /** Top marcadores con probabilidad (%) */
  scorePredictions?: Array<{ score: string; prob: number }>;
  /** Favorito según probabilidad final mezclada */
  favoriteSide?: 'home' | 'draw' | 'away' | null;
  scoreline: { mostLikely: string; alternatives: string[]; source: 'model' | 'live' };
  expected: {
    xgHome: number | null;
    xgAway: number | null;
    cornersHome: number | null;
    cornersAway: number | null;
    cardsHome: number | null;
    cardsAway: number | null;
    note: string;
  };
  form?: TeamFormBlock;
  relatedMatches?: RelatedMatchRow[];
  markets: AnalysisMarket[];
  picks: {
    value: AnalysisPick | null;
    safe: AnalysisPick | null;
    risky: AnalysisPick | null;
    avoid: AnalysisPick | null;
  };
  proposedAccumulators: ProposedAccumulator[];
  confidence: number;
  edgeSummary: string;
  brief?: AnalysisBrief;
  disclaimer: string;
  model?: unknown;
  /** Contexto TheSportsDB (solo en análisis, no en scrapers) */
  sportsDb?: {
    source: 'thesportsdb';
    usedRequestsEstimate: number;
    matchedEvent: {
      id?: string;
      label?: string;
      league?: string;
      date?: string;
      score?: string | null;
    } | null;
    home: {
      id?: string;
      name?: string;
      badge?: string | null;
      recent: Array<{ label: string; score: string | null; date?: string }>;
    };
    away: {
      id?: string;
      name?: string;
      badge?: string | null;
      recent: Array<{ label: string; score: string | null; date?: string }>;
    };
    notes: string[];
  };
  deepAnalysis?: boolean;
  /** true solo si algún LLM respondió de verdad */
  llmUsed?: boolean;
  llmProvider?: string | null;
  /** Cadena de intentos IA → neuronal */
  aiCascade?: {
    preferred: string;
    used: string;
    neuralOnly: boolean;
    attempts: AiAttemptLog[];
  };
  /** Fuentes externas consultadas en este análisis */
  externalSources?: Array<{ name: string; status: 'ok' | 'skip' | 'fail'; detail?: string }>;
  /** Contexto football-data.org (plan free) */
  footballData?: {
    source: 'football-data.org';
    usedRequests: number;
    matchId: number | null;
    status: string | null;
    score: string | null;
    competition: string | null;
    standingsHome: { position: number; points: number; form: string | null } | null;
    standingsAway: { position: number; points: number; form: string | null } | null;
    notes: string[];
  };
  /** Stats rolling + cuotas live RapidAPI */
  rapidApi?: {
    homeStats: TeamRollingStats | null;
    awayStats: TeamRollingStats | null;
    liveOddsCount: number;
    notes: string[];
  };
  /** Diagnósticos live/FT (equipo + jugadores desde TheSportsDB) */
  matchDiagnostics?: {
    phase: string;
    score: string | null;
    statusLabel: string | null;
    venue: string | null;
    kickoffPeru: string | null;
    teamStats: Array<{ name: string; value: string }>;
    players: Array<{
      player: string;
      team: string;
      goals: number;
      assists: number;
      yellowCards: number;
      redCards: number;
      shotsOnTargetMin: number;
    }>;
    notes: string[];
  } | null;
  /** Árbitro: estilo y tendencia a tarjetas/faltas */
  referee?: AnalysisReferee;
  /** Bajas / dudas reportadas (sin inventar si no hay fuente) */
  absences?: {
    home: AnalysisAbsence[];
    away: AnalysisAbsence[];
    notes: string;
    source: 'api' | 'llm' | 'inferred' | 'none';
  };
  /** Escenarios what-if (base, árbitro estricto/permisivo, bajas) */
  scenarios?: AnalysisScenario[];
  /** Multiplicadores aplicados a mercados de disciplina/goles */
  contextMultipliers?: {
    cards: number;
    fouls: number;
    goals: number;
    note: string;
  };
  /** Mercados antes del ajuste arbitral/bajas (para reaplicar sin acumular) */
  marketsBase?: AnalysisMarket[];
};
