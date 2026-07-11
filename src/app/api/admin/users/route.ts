import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/api-guard';

/**
 * Lista usuarios (SuperAdmin).
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      maxSessions: true,
      isActive: true,
      createdAt: true,
      _count: { select: { sessions: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ users });
}

const patchSchema = z.object({
  userId: z.string(),
  role: z.nativeEnum(Role).optional(),
  maxSessions: z.number().int().min(1).max(20).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Actualiza rol / maxSessions / estado de un usuario.
 */
export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const body = patchSchema.parse(await request.json());
    const user = await prisma.user.update({
      where: { id: body.userId },
      data: {
        ...(body.role != null ? { role: body.role } : {}),
        ...(body.maxSessions !== undefined ? { maxSessions: body.maxSessions } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        maxSessions: true,
        isActive: true,
      },
    });

    await prisma.systemLog.create({
      data: {
        category: 'ADMIN',
        message: `Usuario actualizado: ${user.email}`,
        userId: auth.user.id,
        meta: body,
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
