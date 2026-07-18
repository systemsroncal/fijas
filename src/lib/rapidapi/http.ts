/**
 * HTTP genérico RapidAPI con circuit breaker y rate-limit headers.
 */

import { getApiHealthMonitor } from '@/lib/health/api-health-monitor';
import type { RapidApiProviderId } from '@/lib/rapidapi/hosts';

export function rapidApiKey(): string | null {
  const k = process.env.RAPIDAPI_KEY?.trim();
  return k && k.length > 8 ? k : null;
}

export function isRapidApiConfigured(): boolean {
  return Boolean(rapidApiKey());
}

export async function rapidApiGet<T>(
  host: string,
  path: string,
  providerId: RapidApiProviderId
): Promise<T> {
  return rapidApiRequest<T>(host, path, providerId, 'GET');
}

export async function rapidApiPost<T>(
  host: string,
  path: string,
  providerId: RapidApiProviderId,
  body?: unknown
): Promise<T> {
  return rapidApiRequest<T>(host, path, providerId, 'POST', body);
}

async function rapidApiRequest<T>(
  host: string,
  path: string,
  providerId: RapidApiProviderId,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> {
  const key = rapidApiKey();
  if (!key) throw new Error('RAPIDAPI_KEY no configurado');

  const monitor = getApiHealthMonitor();
  if (monitor.isCircuitOpen(providerId)) {
    throw new Error(`${providerId}: circuit open`);
  }

  const start = Date.now();
  const res = await fetch(`https://${host}${path}`, {
    method,
    headers: {
      'X-RapidAPI-Key': key,
      'X-RapidAPI-Host': host,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(method === 'POST' && body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });

  const rate = monitor.parseRateLimitHeaders(res.headers);

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    monitor.recordFailure(providerId, `${res.status}: ${body.slice(0, 120)}`, Date.now() - start);
    throw new Error(`RapidAPI ${providerId} ${res.status}`);
  }

  monitor.recordSuccess(providerId, Date.now() - start, rate);
  return (await res.json()) as T;
}
