/**
 * Orquestador del pipeline de análisis (datos → modelo → enriquecimiento → LLM opcional).
 */

import type { AiProvider } from '@prisma/client';
import type { MatchContext } from '@/lib/ai/football-model';
import type { StructuredMatchPayload, TeamFormBlock } from '@/lib/ai/analysis-types';
import type { LLMCascadeConfig } from '@/lib/analysis/contracts';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import { applySportsDbToPayload } from '@/lib/sportsdb/enrich';
import { applyFootballDataToPayload } from '@/lib/football-data/enrich';
import { applyRapidApiToPayload } from '@/lib/rapidapi/enrich';
import { refreshModelWithForm, buildModelPayload } from '@/lib/ai/structured-analysis';
import {
  getLlmCascadeManager,
  buildCascadeConfig,
  type EnrichProgressFn,
} from '@/lib/ai/llm-cascade-manager';
import { isFootballDataConfigured } from '@/lib/football-data/client';
import { isRapidApiConfigured } from '@/lib/rapidapi/client';

export type AnalysisOrchestratorProgress = {
  step?: string;
  message: string;
  source?: string;
  ok?: boolean;
  pct?: number;
};

export type RunAnalysisPipelineInput = {
  ctx: MatchContext & { id?: string };
  form: TeamFormBlock;
  mode: 'MATCH' | 'RANDOM' | 'ACCUMULATOR';
  matchDateYmd: string;
  provider: AiProvider | 'NEURAL';
  enrich?: boolean;
  keysByProvider: Partial<Record<AiProvider, string>>;
  matchDiagnostics?: StructuredMatchPayload['matchDiagnostics'];
  onProgress?: (e: AnalysisOrchestratorProgress) => void;
};

export type RunAnalysisPipelineResult = {
  payload: StructuredMatchPayload;
  raw: string;
  providerUsed: AiProvider;
  promptUsed: string;
  cascadeConfig: LLMCascadeConfig;
};

export class AnalysisOrchestrator {
  private readonly health = getApiHealthMonitor();
  private readonly llm = getLlmCascadeManager();

  async run(input: RunAnalysisPipelineInput): Promise<RunAnalysisPipelineResult> {
    const emit = input.onProgress ?? (() => undefined);
    const cascadeConfig = buildCascadeConfig({
      provider: input.provider,
      enrich: input.enrich,
    });

    emit({ step: 'poisson', message: 'Motor Poisson (red neuronal)…', pct: 52 });

    let payload = buildModelPayload(input.ctx, input.mode === 'ACCUMULATOR' ? 'MATCH' : input.mode, {
      form: input.form,
    });

    if (input.matchDiagnostics) {
      payload = { ...payload, matchDiagnostics: input.matchDiagnostics };
    }

    // TheSportsDB — circuit breaker
    emit({ step: 'sportsdb', source: 'sportsdb', message: 'TheSportsDB…', pct: 58 });
    if (!this.health.isCircuitOpen('thesportsdb')) {
      try {
        payload = await applySportsDbToPayload(payload, {
          matchDateYmd: input.matchDateYmd,
          fetchBadges: true,
        });
        this.health.recordSuccess('thesportsdb', 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        this.health.recordFailure('thesportsdb', msg);
        emit({ step: 'sportsdb', source: 'sportsdb', message: `TheSportsDB skip: ${msg}`, ok: false });
      }
    } else {
      emit({ step: 'sportsdb', source: 'sportsdb', message: 'TheSportsDB circuit OPEN → BD', ok: false });
    }

    // football-data.org
    emit({
      step: 'football_data',
      source: 'football_data',
      message: isFootballDataConfigured()
        ? 'football-data.org…'
        : 'football-data.org omitido',
      pct: 62,
    });
    if (isFootballDataConfigured() && !this.health.isCircuitOpen('football_data')) {
      try {
        payload = await applyFootballDataToPayload(payload);
        this.health.recordSuccess('football_data', 0);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'error';
        this.health.recordFailure('football_data', msg);
      }
    }

    if (payload.form?.available) {
      payload = refreshModelWithForm(input.ctx, payload);
    }

    // RapidAPI — stats reales + cuotas live (Épica 1)
    emit({
      step: 'rapidapi',
      source: 'rapidapi',
      message: isRapidApiConfigured() ? 'RapidAPI stats/odds…' : 'RapidAPI omitido',
      pct: 66,
    });
    if (isRapidApiConfigured()) {
      payload = await applyRapidApiToPayload(payload, input.ctx);
      emit({
        step: 'rapidapi',
        source: 'rapidapi',
        message: payload.rapidApi?.notes?.slice(0, 2).join(' · ') || 'RapidAPI OK',
        ok: Boolean(
          payload.rapidApi?.homeStats ||
            payload.rapidApi?.liveOddsCount ||
            payload.rapidApi?.footballPrediction ||
            (payload.rapidApi?.sportScore?.eventCount ?? 0) > 0
        ),
        pct: 68,
      });
    }

    this.health.recordSuccess('database_scrape', 0);

    const onLlmProgress: EnrichProgressFn = (ev) =>
      emit({
        step: ev.step ?? 'ai',
        message: ev.message,
        source: 'llm',
        ok: ev.ok,
        pct: ev.pct,
      });

    emit({
      step: 'ai',
      message:
        cascadeConfig.mode === 'ml_only'
          ? 'Modo ML puro (sin LLM)…'
          : `Cascada LLM desde ${cascadeConfig.preferred}…`,
      pct: 72,
    });

    const llmResult = await this.llm.run({
      config: cascadeConfig,
      keysByProvider: input.keysByProvider,
      payload,
      onProgress: onLlmProgress,
    });

    return {
      payload: llmResult.payload,
      raw: llmResult.raw,
      providerUsed: llmResult.providerUsed,
      promptUsed: llmResult.promptUsed,
      cascadeConfig,
    };
  }
}

export function getAnalysisOrchestrator(): AnalysisOrchestrator {
  return new AnalysisOrchestrator();
}
