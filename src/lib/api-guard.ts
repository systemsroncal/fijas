import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';
import type { Role } from '@prisma/client';

export type AuthSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: Role;
};

/**
 * Obtiene la sesión del servidor o null.
 */
export async function getSessionUser(): Promise<AuthSessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session as { error?: string }).error === 'SessionInvalid') {
    return null;
  }
  const user = session.user as AuthSessionUser;
  if (!user.id) return null;
  return user;
}

/**
 * Requiere autenticación; aplica rate limit MySQL.
 */
export async function requireAuth(): Promise<
  { user: AuthSessionUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const rl = await checkRateLimit(`user:${user.id}`, 100);
  if (!rl.allowed) {
    return {
      error: NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.retryAfter) },
        }
      ),
    };
  }

  return { user };
}

/**
 * Requiere rol SuperAdmin.
 */
export async function requireSuperAdmin(): Promise<
  { user: AuthSessionUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;
  if (result.user.role !== 'SUPERADMIN') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return result;
}

/**
 * Valida API_SECRET del scraper en header Authorization o X-API-Secret.
 */
export function validateApiSecret(request: Request): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get('x-api-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}
