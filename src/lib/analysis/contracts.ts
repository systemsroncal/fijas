/**
 * Contratos del pipeline de análisis (Épica 1 + 2).
 */

import type { AiProvider } from '@prisma/client';
import type {
  StructuredMatchPayload,
  TeamRollingStats,
  LiveMarketQuote,
} from '@/lib/ai/analysis-types';

export type { TeamRollingStats, LiveMarketQuote };

/** Estado de salud de un proveedor externo (datos o LLM). */
export type APIHealthStatus = {
  providerId: string;
  label: string;
  kind: 'data' | 'llm';
  state: 'UP' | 'DEGRADED' | 'DOWN';
  circuit: 'closed' | 'open' | 'half-open';
  latencyMs: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  lastError: string | null;
};

/** Modo de análisis solicitado por el cliente. */
export type AnalysisEngineMode = 'ml_only' | 'ml_with_llm';

/** Configuración de cascada LLM (Chain of Responsibility). */
export type LLMCascadeConfig = {
  mode: AnalysisEngineMode;
  preferred: AiProvider | 'NEURAL';
  /** Orden de fallback tras el preferido */
  fallbackOrder: AiProvider[];
  maxAttemptsPerProvider: number;
  providerWallMs: number;
  httpTimeoutMs: number;
  /** Si true, degradar a ML puro sin lanzar 500 */
  degradeToNeuralOnExhaustion: boolean;
};

export type LLMCascadeResult = {
  payload: StructuredMatchPayload;
  raw: string;
  providerUsed: AiProvider;
  promptUsed: string;
  neuralOnly: boolean;
  attempts: import('@/lib/ai/analysis-types').AiAttemptLog[];
};

export type DataProviderId =
  | 'rapidapi_football'
  | 'rapidapi_odds'
  | 'thesportsdb'
  | 'football_data'
  | 'database_scrape';

export const DEFAULT_LLM_CASCADE: LLMCascadeConfig = {
  mode: 'ml_with_llm',
  preferred: 'GEMINI',
  fallbackOrder: ['GEMINI', 'NVIDIA', 'OPENAI', 'CLAUDE', 'DEEPSEEK', 'GROK', 'OPENROUTER', 'MISTRAL', 'COHERE'],
  maxAttemptsPerProvider: 3,
  providerWallMs: 50_000,
  httpTimeoutMs: 18_000,
  degradeToNeuralOnExhaustion: true,
};

export type CachePolicy = {
  /** TTL fresco (ms) */
  freshTtlMs: number;
  /** TTL máximo servir stale (ms) */
  staleTtlMs: number;
};

export const CACHE_POLICIES = {
  teamStats: { freshTtlMs: 6 * 60 * 60_000, staleTtlMs: 24 * 60 * 60_000 },
  liveOdds: { freshTtlMs: 90_000, staleTtlMs: 10 * 60_000 },
} as const satisfies Record<string, CachePolicy>;
