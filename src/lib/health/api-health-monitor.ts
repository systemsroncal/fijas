/**
 * Monitor de salud + Circuit Breaker para proveedores de datos y LLM.
 * Patrón: closed → open (N fallos) → half-open (probe) → closed.
 */

import type { APIHealthStatus, DataProviderId } from '@/lib/analysis/contracts';
import { RAPIDAPI_PROVIDER_LABELS, type RapidApiProviderId } from '@/lib/rapidapi/hosts';
import type { AiProvider } from '@prisma/client';

export type ProviderKind = 'data' | 'llm';

type CircuitState = 'closed' | 'open' | 'half-open';

type InternalRecord = {
  providerId: string;
  label: string;
  kind: ProviderKind;
  circuit: CircuitState;
  consecutiveFailures: number;
  latencyMs: number | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  circuitOpenedAt: Date | null;
  rateLimitRemaining: number | null;
  rateLimitResetAt: Date | null;
  lastError: string | null;
};

export type HealthMonitorOptions = {
  failureThreshold?: number;
  openCooldownMs?: number;
  halfOpenMaxProbes?: number;
};

const DEFAULT_OPTS: Required<HealthMonitorOptions> = {
  failureThreshold: 3,
  openCooldownMs: 60_000,
  halfOpenMaxProbes: 1,
};

const RAPIDAPI_DATA_PROVIDERS: Array<{ id: RapidApiProviderId; label: string }> = (
  Object.entries(RAPIDAPI_PROVIDER_LABELS) as Array<[RapidApiProviderId, string]>
).map(([id, label]) => ({ id, label }));

const DATA_PROVIDERS: Array<{ id: DataProviderId; label: string }> = [
  ...RAPIDAPI_DATA_PROVIDERS,
  { id: 'thesportsdb', label: 'TheSportsDB' },
  { id: 'football_data', label: 'football-data.org' },
  { id: 'database_scrape', label: 'BD scrape local' },
];

const LLM_PROVIDERS: AiProvider[] = [
  'OPENAI',
  'GEMINI',
  'GROK',
  'DEEPSEEK',
  'OPENROUTER',
  'NVIDIA',
  'CLAUDE',
  'MISTRAL',
  'COHERE',
];

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function deriveState(rec: InternalRecord): APIHealthStatus['state'] {
  if (rec.circuit === 'open') return 'DOWN';
  if (rec.consecutiveFailures > 0) return 'DEGRADED';
  return 'UP';
}

export class ApiHealthMonitor {
  private readonly records = new Map<string, InternalRecord>();
  private readonly opts: Required<HealthMonitorOptions>;
  private halfOpenProbes = new Map<string, number>();

  constructor(opts?: HealthMonitorOptions) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
    for (const p of DATA_PROVIDERS) {
      this.ensure(p.id, p.label, 'data');
    }
    for (const p of LLM_PROVIDERS) {
      this.ensure(p, p, 'llm');
    }
    this.ensure('database_scrape', 'BD scrape local', 'data');
  }

  ensure(providerId: string, label: string, kind: ProviderKind): void {
    if (this.records.has(providerId)) return;
    this.records.set(providerId, {
      providerId,
      label,
      kind,
      circuit: 'closed',
      consecutiveFailures: 0,
      latencyMs: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      circuitOpenedAt: null,
      rateLimitRemaining: null,
      rateLimitResetAt: null,
      lastError: null,
    });
  }

  isCircuitOpen(providerId: string): boolean {
    const rec = this.records.get(providerId);
    if (!rec) return false;
    if (rec.circuit === 'open') {
      const opened = rec.circuitOpenedAt?.getTime() ?? 0;
      if (Date.now() - opened >= this.opts.openCooldownMs) {
        rec.circuit = 'half-open';
        this.halfOpenProbes.set(providerId, 0);
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(
    providerId: string,
    latencyMs: number,
    rateHeaders?: { remaining?: number | null; resetAt?: Date | null }
  ): void {
    const rec = this.records.get(providerId);
    if (!rec) return;
    rec.consecutiveFailures = 0;
    rec.circuit = 'closed';
    rec.circuitOpenedAt = null;
    rec.latencyMs = latencyMs;
    rec.lastSuccessAt = new Date();
    rec.lastError = null;
    if (rateHeaders?.remaining != null) rec.rateLimitRemaining = rateHeaders.remaining;
    if (rateHeaders?.resetAt) rec.rateLimitResetAt = rateHeaders.resetAt;
    this.halfOpenProbes.delete(providerId);
  }

  recordFailure(providerId: string, error: string, latencyMs?: number): void {
    const rec = this.records.get(providerId);
    if (!rec) return;
    rec.consecutiveFailures += 1;
    rec.lastFailureAt = new Date();
    rec.lastError = error.slice(0, 240);
    if (latencyMs != null) rec.latencyMs = latencyMs;

    if (rec.circuit === 'half-open') {
      rec.circuit = 'open';
      rec.circuitOpenedAt = new Date();
      return;
    }

    if (rec.consecutiveFailures >= this.opts.failureThreshold) {
      rec.circuit = 'open';
      rec.circuitOpenedAt = new Date();
    }
  }

  parseRateLimitHeaders(headers: Headers): {
    remaining: number | null;
    resetAt: Date | null;
  } {
    const remainingRaw =
      headers.get('x-ratelimit-requests-remaining') ??
      headers.get('x-ratelimit-remaining') ??
      headers.get('ratelimit-remaining');
    const resetRaw =
      headers.get('x-ratelimit-requests-reset') ??
      headers.get('x-ratelimit-reset') ??
      headers.get('ratelimit-reset');

    let remaining: number | null = null;
    if (remainingRaw != null) {
      const n = Number(remainingRaw);
      if (!Number.isNaN(n)) remaining = n;
    }

    let resetAt: Date | null = null;
    if (resetRaw != null) {
      const n = Number(resetRaw);
      if (!Number.isNaN(n)) {
        resetAt = n > 1_000_000_000_000 ? new Date(n) : new Date(Date.now() + n * 1000);
      }
    }
    return { remaining, resetAt };
  }

  /**
   * Ejecuta fn con circuit breaker. Si el circuito está abierto, devuelve null (degradación).
   */
  async executeWithCircuit<T>(
    providerId: string,
    fn: () => Promise<T>,
    onOpen?: () => T | Promise<T>
  ): Promise<T | null> {
    if (this.isCircuitOpen(providerId)) {
      return onOpen ? await onOpen() : null;
    }

    const rec = this.records.get(providerId);
    if (rec?.circuit === 'half-open') {
      const probes = this.halfOpenProbes.get(providerId) ?? 0;
      if (probes >= this.opts.halfOpenMaxProbes) {
        return onOpen ? await onOpen() : null;
      }
      this.halfOpenProbes.set(providerId, probes + 1);
    }

    const start = Date.now();
    try {
      const result = await fn();
      this.recordSuccess(providerId, Date.now() - start);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordFailure(providerId, msg, Date.now() - start);
      throw err;
    }
  }

  /** Ejecuta fn; en fallo registra y devuelve fallback sin propagar error. */
  async executeWithGracefulDegradation<T>(
    providerId: string,
    fn: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    if (this.isCircuitOpen(providerId)) return fallback;
    const start = Date.now();
    try {
      const result = await fn();
      this.recordSuccess(providerId, Date.now() - start);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordFailure(providerId, msg, Date.now() - start);
      return fallback;
    }
  }

  getStatus(providerId: string): APIHealthStatus | null {
    const rec = this.records.get(providerId);
    if (!rec) return null;
    return {
      providerId: rec.providerId,
      label: rec.label,
      kind: rec.kind,
      state: deriveState(rec),
      circuit: rec.circuit,
      latencyMs: rec.latencyMs,
      lastSuccessAt: toIso(rec.lastSuccessAt),
      lastFailureAt: toIso(rec.lastFailureAt),
      consecutiveFailures: rec.consecutiveFailures,
      rateLimitRemaining: rec.rateLimitRemaining,
      rateLimitResetAt: toIso(rec.rateLimitResetAt),
      lastError: rec.lastError,
    };
  }

  getAllStatuses(): APIHealthStatus[] {
    return [...this.records.values()]
      .map((rec) => this.getStatus(rec.providerId)!)
      .sort((a, b) => a.providerId.localeCompare(b.providerId));
  }
}

/** Singleton del proceso (serverless: estado por instancia). */
let globalMonitor: ApiHealthMonitor | null = null;

export function getApiHealthMonitor(): ApiHealthMonitor {
  if (!globalMonitor) globalMonitor = new ApiHealthMonitor();
  return globalMonitor;
}

export function resetApiHealthMonitorForTests(): void {
  globalMonitor = null;
}
