import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/api-guard';

const createSchema = z.object({
  name: z.string().optional(),
  legs: z
    .array(
      z.object({
        matchId: z.string(),
        betType: z.string().optional(),
        betChoice: z.string().optional(),
        odds: z.number().positive(),
      })
    )
    .min(1),
});

/**
 * Lista acumuladas del usuario.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const accumulators = await prisma.accumulator.findMany({
    where: { userId: auth.user.id },
    include: {
      matches: { include: { match: true } },
      analyses: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ accumulators });
}

/**
 * Crea una acumulada con cálculo de cuota total.
 */
export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  try {
    const body = createSchema.parse(await request.json());
    const totalOdds = body.legs.reduce((acc, leg) => acc * leg.odds, 1);

    const accumulator = await prisma.accumulator.create({
      data: {
        userId: auth.user.id,
        name: body.name ?? `Combinada ${new Date().toISOString().slice(0, 10)}`,
        totalOdds: new Prisma.Decimal(totalOdds.toFixed(3)),
        matches: {
          create: body.legs.map((leg) => ({
            matchId: leg.matchId,
            betType: leg.betType,
            betChoice: leg.betChoice,
            odds: new Prisma.Decimal(leg.odds),
          })),
        },
      },
      include: { matches: { include: { match: true } } },
    });

    return NextResponse.json({ accumulator }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Failed to create accumulator' }, { status: 500 });
  }
}
