import { NextResponse } from 'next/server';
import { LogCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/api-guard';

/**
 * Logs del sistema filtrables por categoría.
 */
export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') as LogCategory | null;

  const logs = await prisma.systemLog.findMany({
    where: category ? { category } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ logs });
}
