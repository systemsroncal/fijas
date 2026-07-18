import {
  ApiHealthMonitor,
  resetApiHealthMonitorForTests,
} from '@/lib/health/api-health-monitor';

describe('ApiHealthMonitor', () => {
  beforeEach(() => resetApiHealthMonitorForTests());

  it('abre circuito tras N fallos consecutivos', () => {
    const monitor = new ApiHealthMonitor({ failureThreshold: 2, openCooldownMs: 60_000 });
    monitor.recordFailure('rapidapi_football', '500');
    expect(monitor.isCircuitOpen('rapidapi_football')).toBe(false);
    monitor.recordFailure('rapidapi_football', '500');
    expect(monitor.isCircuitOpen('rapidapi_football')).toBe(true);
  });

  it('executeWithGracefulDegradation devuelve fallback sin lanzar', async () => {
    const monitor = new ApiHealthMonitor({ failureThreshold: 1 });
    const result = await monitor.executeWithGracefulDegradation(
      'rapidapi_odds',
      async () => {
        throw new Error('timeout');
      },
      { ok: false }
    );
    expect(result).toEqual({ ok: false });
    expect(monitor.isCircuitOpen('rapidapi_odds')).toBe(true);
  });

  it('expone estado UP/DOWN', () => {
    const monitor = new ApiHealthMonitor();
    monitor.recordSuccess('GEMINI', 120);
    const st = monitor.getStatus('GEMINI');
    expect(st?.state).toBe('UP');
    expect(st?.latencyMs).toBe(120);
  });
});

describe('buildCascadeConfig', () => {
  it('resuelve ml_only para NEURAL', async () => {
    const { resolveAnalysisMode } = await import('@/lib/ai/llm-cascade-manager');
    expect(resolveAnalysisMode({ provider: 'NEURAL', enrich: true })).toBe('ml_only');
    expect(resolveAnalysisMode({ provider: 'GEMINI', enrich: false })).toBe('ml_only');
    expect(resolveAnalysisMode({ provider: 'GEMINI', enrich: true })).toBe('ml_with_llm');
  });
});
