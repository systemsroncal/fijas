import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AiProvider, LogCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';
import { decryptSecret } from '@/lib/encryption';
import { testProviderConnection } from '@/lib/ai/providers';

const schema = z.object({
  provider: z.nativeEnum(AiProvider),
  apiKey: z.string().min(8).optional(),
});

/**
 * Prueba conexión con un proveedor (clave enviada o la guardada).
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = schema.parse(await request.json());
    let apiKey = body.apiKey;

    if (!apiKey) {
      const stored = await prisma.apiKey.findUnique({
        where: {
          userId_provider: { userId: auth.user.id, provider: body.provider },
        },
      });
      if (!stored) {
        return NextResponse.json({ error: 'No saved key for provider' }, { status: 404 });
      }
      apiKey = decryptSecret(stored.encryptedKey);
    }

    const result = await testProviderConnection(body.provider, apiKey);

    await prisma.systemLog.create({
      data: {
        category: LogCategory.API_KEY,
        level: result.ok ? 'info' : 'warn',
        message: `Test ${body.provider}: ${result.message}`,
        userId: auth.user.id,
      },
    });

    if (result.ok) {
      await prisma.apiKey.updateMany({
        where: { userId: auth.user.id, provider: body.provider },
        data: { lastUsed: new Date() },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}
