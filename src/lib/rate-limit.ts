import { prisma } from '@/lib/prisma';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;

/**
 * Rate limiting basado en MySQL (sin Redis).
 * Ventana deslizante por minuto: máximo `limit` peticiones por identificador.
 *
 * @returns true si la petición está permitida
 */
export async function checkRateLimit(
  identifier: string,
  limit: number = DEFAULT_LIMIT
): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS);

  const record = await prisma.rateLimit.upsert({
    where: {
      identifier_windowStart: { identifier, windowStart },
    },
    create: { identifier, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  const allowed = record.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - record.count),
    retryAfter: Math.ceil((windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000),
  };
}
