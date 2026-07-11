/**
 * Prefijo de rutas (vacío en Vercel/Netlify; `/wps-admin` solo si lo configuras).
 */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

/**
 * Construye URL de API respetando basePath.
 * @example apiUrl('/api/matches') → '/api/matches' o '/wps-admin/api/matches'
 */
export function apiUrl(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}
