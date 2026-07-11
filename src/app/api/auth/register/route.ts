import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { LogCategory } from '@prisma/client';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(40).optional(),
  name: z.string().min(1).max(80).optional(),
});

/**
 * Registro de nuevos suscriptores.
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'anon';
  const rl = await checkRateLimit(`register:${ip}`, 10);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  try {
    const body = await request.json();
    const data = schema.parse(body);
    const email = data.email.toLowerCase().trim();

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        username: data.username,
        name: data.name ?? data.username ?? email.split('@')[0],
        passwordHash,
        role: 'SUBSCRIBER',
      },
      select: { id: true, email: true, username: true, role: true },
    });

    await prisma.systemLog.create({
      data: {
        category: LogCategory.AUTH,
        message: `Usuario registrado: ${user.email}`,
        userId: user.id,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
