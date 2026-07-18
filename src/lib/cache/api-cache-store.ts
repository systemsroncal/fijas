/**
 * Caché stale-while-revalidate en BD (Prisma) con fallback en memoria.
 */

import { prisma } from '@/lib/prisma';
import type { CachePolicy } from '@/lib/analysis/contracts';

type CacheEnvelope<T> = {
  data: T;
  fetchedAt: string;
  staleAt: string;
  expiresAt: string;
  isStale: boolean;
};

const memFallback = new Map<string, CacheEnvelope<unknown>>();

function nowMs(): number {
  return Date.now();
}

function envelope<T>(
  data: T,
  policy: CachePolicy,
  fetchedAt = nowMs()
): CacheEnvelope<T> {
  return {
    data,
    fetchedAt: new Date(fetchedAt).toISOString(),
    staleAt: new Date(fetchedAt + policy.freshTtlMs).toISOString(),
    expiresAt: new Date(fetchedAt + policy.staleTtlMs).toISOString(),
    isStale: false,
  };
}

function classifyEnvelope<T>(raw: CacheEnvelope<T>, policy: CachePolicy): {
  hit: 'fresh' | 'stale' | 'miss';
  env: CacheEnvelope<T> | null;
} {
  const fetched = Date.parse(raw.fetchedAt);
  const age = nowMs() - fetched;
  if (age <= policy.freshTtlMs) {
    return { hit: 'fresh', env: { ...raw, isStale: false } };
  }
  if (age <= policy.staleTtlMs) {
    return { hit: 'stale', env: { ...raw, isStale: true } };
  }
  return { hit: 'miss', env: null };
}

export class ApiCacheStore {
  async get<T>(cacheKey: string, policy: CachePolicy): Promise<CacheEnvelope<T> | null> {
    try {
      const row = await prisma.apiDataCache.findUnique({ where: { cacheKey } });
      if (row) {
        const raw = {
          data: row.payload as T,
          fetchedAt: row.fetchedAt.toISOString(),
          staleAt: row.staleAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          isStale: row.fetchedAt.getTime() + policy.freshTtlMs < nowMs(),
        };
        const { hit, env } = classifyEnvelope(raw, policy);
        if (hit !== 'miss' && env) return env;
      }
    } catch {
      // Prisma no migrado → memoria
    }

    const mem = memFallback.get(cacheKey) as CacheEnvelope<T> | undefined;
    if (!mem) return null;
    const { hit, env } = classifyEnvelope(mem, policy);
    return hit === 'miss' ? null : env;
  }

  async set<T>(
    cacheKey: string,
    provider: string,
    data: T,
    policy: CachePolicy
  ): Promise<void> {
    const fetchedAt = new Date();
    const staleAt = new Date(fetchedAt.getTime() + policy.freshTtlMs);
    const expiresAt = new Date(fetchedAt.getTime() + policy.staleTtlMs);
    const env = envelope(data, policy, fetchedAt.getTime());

    memFallback.set(cacheKey, env);

    try {
      await prisma.apiDataCache.upsert({
        where: { cacheKey },
        create: {
          cacheKey,
          provider,
          payload: data as object,
          fetchedAt,
          staleAt,
          expiresAt,
        },
        update: {
          provider,
          payload: data as object,
          fetchedAt,
          staleAt,
          expiresAt,
        },
      });
    } catch {
      // fallback memoria ya escrito
    }
  }

  /**
   * SWR: devuelve stale inmediato y revalida en background si aplica.
   */
  async getOrFetch<T>(opts: {
    cacheKey: string;
    provider: string;
    policy: CachePolicy;
    fetcher: () => Promise<T>;
    onRevalidate?: (data: T) => void;
  }): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
    const cached = await this.get<T>(opts.cacheKey, opts.policy);
    if (cached && !cached.isStale) {
      return { data: cached.data, fromCache: true, isStale: false };
    }

    if (cached?.isStale) {
      void opts
        .fetcher()
        .then(async (fresh) => {
          await this.set(opts.cacheKey, opts.provider, fresh, opts.policy);
          opts.onRevalidate?.(fresh);
        })
        .catch(() => undefined);
      return { data: cached.data, fromCache: true, isStale: true };
    }

    const fresh = await opts.fetcher();
    await this.set(opts.cacheKey, opts.provider, fresh, opts.policy);
    return { data: fresh, fromCache: false, isStale: false };
  }
}

let globalCache: ApiCacheStore | null = null;

export function getApiCacheStore(): ApiCacheStore {
  if (!globalCache) globalCache = new ApiCacheStore();
  return globalCache;
}

export function resetApiCacheStoreForTests(): void {
  memFallback.clear();
  globalCache = null;
}
