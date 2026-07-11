import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Cuenta sesiones activas de un usuario en MySQL (expires > now).
 */
export async function countActiveSessions(userId: string): Promise<number> {
  return prisma.session.count({
    where: {
      userId,
      expires: { gt: new Date() },
    },
  });
}

/**
 * Resuelve el límite de sesiones: override del usuario o configuración del rol.
 */
export async function resolveMaxSessions(
  userId: string,
  role: Role,
  userMaxSessions: number | null | undefined
): Promise<number> {
  if (userMaxSessions != null && userMaxSessions > 0) {
    return userMaxSessions;
  }
  const control = await prisma.sessionControl.findUnique({ where: { role } });
  return control?.maxSessions ?? (role === 'SUPERADMIN' ? 5 : 1);
}

/**
 * Verifica si el usuario puede abrir una nueva sesión.
 * Si no puede, retorna el mensaje de error en español.
 */
export async function canOpenNewSession(
  userId: string,
  role: Role,
  userMaxSessions: number | null | undefined
): Promise<{ ok: true } | { ok: false; message: string }> {
  const max = await resolveMaxSessions(userId, role, userMaxSessions);
  const active = await countActiveSessions(userId);
  if (active >= max) {
    return {
      ok: false,
      message: `Has superado el límite de ${max} sesiones simultáneas. Cierra sesión en otro dispositivo.`,
    };
  }
  return { ok: true };
}

/**
 * Elimina todas las sesiones de usuarios con un rol dado (forzar logout).
 */
export async function forceLogoutByRole(role: Role): Promise<number> {
  const users = await prisma.user.findMany({
    where: { role },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return 0;
  const result = await prisma.session.deleteMany({
    where: { userId: { in: ids } },
  });
  return result.count;
}

/**
 * Elimina sesiones expiradas (limpieza periódica opcional).
 */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { expires: { lt: new Date() } },
  });
  return result.count;
}
