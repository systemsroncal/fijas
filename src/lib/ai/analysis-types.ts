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
  source: 'model' | 'estimated';
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
    matchLabel: string;
    market: string;
    betChoice: string;
    odds: number;
  }>;
};

export type StructuredMatchPayload = {
  mode: 'MATCH' | 'RANDOM';
  match?: {
    id?: string;
    homeTeam: string;
    awayTeam: string;
    league: string;
    tip?: string | null;
  };
  probs: { home: number; draw: number; away: number };
  scoreline: { mostLikely: string; alternatives: string[] };
  expected: {
    xgHome: number;
    xgAway: number;
    cornersHome: number;
    cornersAway: number;
    cardsHome: number;
    cardsAway: number;
  };
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
  disclaimer: string;
  model?: unknown;
};
