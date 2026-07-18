/**
 * Cadena de responsabilidad para proveedores LLM + degradación a ML puro.
 * Integra ApiHealthMonitor: omite proveedores con circuito abierto.
 */

import type { AiProvider } from '@prisma/client';
import type { StructuredMatchPayload, AiAttemptLog } from '@/lib/ai/analysis-types';
import type {
  AnalysisEngineMode,
  LLMCascadeConfig,
  LLMCascadeResult,
} from '@/lib/analysis/contracts';
import { DEFAULT_LLM_CASCADE } from '@/lib/analysis/contracts';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import {
  enrichPayloadWithLlm,
  type AnalysisProviderChoice,
  type EnrichProgressFn,
} from '@/lib/ai/structured-analysis';

export type LlmCascadeManagerDeps = {
  healthMonitor?: ReturnType<typeof getApiHealthMonitor>;
};

export function resolveAnalysisMode(input: {
  provider: AiProvider | 'NEURAL';
  enrich?: boolean;
}): AnalysisEngineMode {
  if (input.provider === 'NEURAL' || input.enrich === false) return 'ml_only';
  return 'ml_with_llm';
}

export function buildCascadeConfig(input: {
  provider: AiProvider | 'NEURAL';
  enrich?: boolean;
  overrides?: Partial<LLMCascadeConfig>;
}): LLMCascadeConfig {
  const mode = resolveAnalysisMode(input);
  const preferred =
    input.provider === 'NEURAL' ? 'NEURAL' : (input.provider as AiProvider);
  return {
    ...DEFAULT_LLM_CASCADE,
    mode,
    preferred: preferred as LLMCascadeConfig['preferred'],
    ...input.overrides,
  };
}

/** Orden efectivo: preferido → fallback filtrado por keys y circuit breaker. */
export function orderedLlmProviders(
  config: LLMCascadeConfig,
  keysByProvider: Partial<Record<AiProvider, string>>
): AiProvider[] {
  const monitor = getApiHealthMonitor();
  const preferred =
    config.preferred === 'NEURAL' ? null : (config.preferred as AiProvider);

  const chain: AiProvider[] = [];
  if (preferred && keysByProvider[preferred] && !monitor.isCircuitOpen(preferred)) {
    chain.push(preferred);
  }

  for (const p of config.fallbackOrder) {
    if (p === preferred) continue;
    if (!keysByProvider[p]) continue;
    if (monitor.isCircuitOpen(p)) continue;
    chain.push(p);
  }
  return chain;
}

export class LlmCascadeManager {
  private readonly monitor: ReturnType<typeof getApiHealthMonitor>;

  constructor(deps?: LlmCascadeManagerDeps) {
    this.monitor = deps?.healthMonitor ?? getApiHealthMonitor();
  }

  /**
   * Ejecuta cascada LLM o devuelve ML puro. Nunca lanza 500 por agotamiento de IAs.
   */
  async run(input: {
    config: LLMCascadeConfig;
    keysByProvider: Partial<Record<AiProvider, string>>;
    payload: StructuredMatchPayload;
    onProgress?: EnrichProgressFn;
  }): Promise<LLMCascadeResult> {
    const { config, keysByProvider, payload, onProgress } = input;

    if (config.mode === 'ml_only' || config.preferred === 'NEURAL') {
      return this.toResult(
        await enrichPayloadWithLlm('NEURAL', keysByProvider, payload, onProgress)
      );
    }

    const chain = orderedLlmProviders(config, keysByProvider);
    if (chain.length === 0) {
      onProgress?.({
        step: 'ai',
        message: 'Sin proveedores LLM disponibles (sin keys o circuit open) → ML puro',
        pct: 88,
      });
      return this.toResult(
        await enrichPayloadWithLlm('NEURAL', keysByProvider, payload, onProgress)
      );
    }

    const preferred = config.preferred as AiProvider;
    try {
      const result = await enrichPayloadWithLlm(
        preferred,
        keysByProvider,
        payload,
        (ev) => {
          if (ev.provider && ev.ok === false) {
            this.monitor.recordFailure(String(ev.provider), ev.message ?? 'LLM fail');
          } else if (ev.provider && ev.ok === true) {
            this.monitor.recordSuccess(String(ev.provider), 0);
          }
          onProgress?.(ev);
        }
      );

      if (!result.neuralOnly && result.providerUsed) {
        this.monitor.recordSuccess(result.providerUsed, 0);
      }

      return this.toResult(result);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.monitor.recordFailure(preferred, detail);

      if (!config.degradeToNeuralOnExhaustion) {
        throw err;
      }

      onProgress?.({
        step: 'ai',
        message: `Cascada agotada (${detail.slice(0, 80)}) → ML puro`,
        ok: false,
        pct: 92,
      });

      return this.toResult(
        await enrichPayloadWithLlm('NEURAL', keysByProvider, payload, onProgress)
      );
    }
  }

  private toResult(r: Awaited<ReturnType<typeof enrichPayloadWithLlm>>): LLMCascadeResult {
    return {
      payload: r.payload,
      raw: r.raw,
      providerUsed: r.providerUsed,
      promptUsed: r.promptUsed,
      neuralOnly: r.neuralOnly,
      attempts: r.attempts,
    };
  }
}

export function getLlmCascadeManager(): LlmCascadeManager {
  return new LlmCascadeManager();
}

export type { AnalysisProviderChoice, EnrichProgressFn };
