/**
 * Tipos compartidos del análisis estructurado (seguros para cliente).
 */

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
  scoreline: { mostLikely: string; alternatives: string[]; source: 'model' };
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
  /** true solo si el LLM del proveedor elegido respondió de verdad */
  llmUsed?: boolean;
  llmProvider?: string | null;
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
};
