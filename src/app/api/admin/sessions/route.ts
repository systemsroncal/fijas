import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/api-guard';
import { forceLogoutByRole } from '@/lib/session-control';

/**
 * Obtiene configuración de sesiones por rol.
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const controls = await prisma.sessionControl.findMany();
  return NextResponse.json({ controls });
}

const putSchema = z.object({
  role: z.nativeEnum(Role),
  maxSessions: z.number().int().min(1).max(50),
  enforceSingleDevice: z.boolean().optional(),
});

/**
 * Actualiza límites de sesión por rol.
 */
export async function PUT(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const body = putSchema.parse(await request.json());
    const control = await prisma.sessionControl.upsert({
      where: { role: body.role },
      create: {
        role: body.role,
        maxSessions: body.maxSessions,
        enforceSingleDevice: body.enforceSingleDevice ?? false,
      },
      update: {
        maxSessions: body.maxSessions,
        ...(body.enforceSingleDevice != null
          ? { enforceSingleDevice: body.enforceSingleDevice }
          : {}),
      },
    });

    return NextResponse.json({ control });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

const forceSchema = z.object({
  role: z.nativeEnum(Role),
});

/**
 * Fuerza cierre de sesión de todos los usuarios de un rol.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const body = forceSchema.parse(await request.json());
    const deleted = await forceLogoutByRole(body.role);

    await prisma.systemLog.create({
      data: {
        category: 'ADMIN',
        message: `Force logout role ${body.role}: ${deleted} sessions`,
        userId: auth.user.id,
      },
    });

    return NextResponse.json({ deleted });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'Force logout failed' }, { status: 500 });
  }
}
