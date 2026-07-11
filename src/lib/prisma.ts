/**
 * Cliente Prisma para serverless (Vercel/Netlify).
 * Reutiliza la instancia en warm starts; en cold starts crea una nueva.
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// En serverless también conviene cachear en global para reutilizar conexiones
if (process.env.VERCEL || process.env.NETLIFY) {
  globalForPrisma.prisma = prisma;
}
