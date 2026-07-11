import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, LogCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { encryptSecret, decryptSecret } from '@/lib/encryption';
import { testProviderConnection } from '@/lib/ai/providers';

const saveSchema = z.object({
  provider: z.nativeEnum(AiProvider),
  apiKey: z.string().min(8),
});

/**
 * Lista proveedores configurados (sin exponer la clave).
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const keys = await prisma.apiKey.findMany({
    where: { userId: auth.user.id },
    select: {
      id: true,
      provider: true,
      isActive: true,
      createdAt: true,
      lastUsed: true,
    },
  });

  return NextResponse.json({ keys });
}

/**
 * Guarda o actualiza una clave API encriptada (una por proveedor).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = saveSchema.parse(await request.json());
    const encryptedKey = encryptSecret(body.apiKey);

    const key = await prisma.apiKey.upsert({
      where: {
        userId_provider: { userId: auth.user.id, provider: body.provider },
      },
      create: {
        userId: auth.user.id,
        provider: body.provider,
        encryptedKey,
        isActive: true,
      },
      update: {
        encryptedKey,
        isActive: true,
      },
      select: { id: true, provider: true, isActive: true, createdAt: true },
    });

    await prisma.systemLog.create({
      data: {
        category: LogCategory.API_KEY,
        message: `API key guardada: ${body.provider}`,
        userId: auth.user.id,
      },
    });

    return NextResponse.json({ key });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Failed to save API key' }, { status: 500 });
  }
}

/**
 * Elimina una clave por proveedor.
 */
export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const valid = Object.values(AiProvider) as string[];
  if (!provider || !valid.includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  await prisma.apiKey.deleteMany({
    where: { userId: auth.user.id, provider: provider as AiProvider },
  });

  return NextResponse.json({ ok: true });
}

export { decryptSecret, testProviderConnection };
