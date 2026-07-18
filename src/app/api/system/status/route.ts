import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-guard';
import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import { isFootballDataConfigured } from '@/lib/football-data/client';
import { isRapidApiConfigured } from '@/lib/rapidapi/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/system/status — salud de proveedores de datos + LLM (circuit breaker).
 * Requiere sesión autenticada.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const monitor = getApiHealthMonitor();
  const providers = monitor.getAllStatuses();

  const summary = {
    up: providers.filter((p) => p.state === 'UP').length,
    degraded: providers.filter((p) => p.state === 'DEGRADED').length,
    down: providers.filter((p) => p.state === 'DOWN').length,
  };

  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    env: {
      footballData: isFootballDataConfigured(),
      rapidApi: isRapidApiConfigured(),
    },
    summary,
    providers,
  });
}
