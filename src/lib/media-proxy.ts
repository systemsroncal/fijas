/**
 * Proxy same-origin para imágenes TheSportsDB (CORS bloquea html-to-image / canvas).
 */

import { apiUrl } from '@/lib/paths';

const ALLOWED_HOSTS = new Set([
  'r2.thesportsdb.com',
  'www.thesportsdb.com',
  'thesportsdb.com',
]);

export function isAllowedMediaHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** URL same-origin para escudos/badges (evita CORS en Exportar PNG). */
export function proxiedMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return url;
  if (!isAllowedMediaHost(url)) return undefined;
  return apiUrl(`/api/media/proxy?url=${encodeURIComponent(url)}`);
}
