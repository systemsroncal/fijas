import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/api-guard';

/**
 * Lista fuentes de scraping.
 */
export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const sources = await prisma.scrapingSource.findMany({
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ sources });
}

const patchSchema = z.object({
  id: z.string(),
  isActive: z.boolean().optional(),
  selectorsConfig: z.record(z.unknown()).optional(),
});

/**
 * Actualiza selectores / estado de un scraper.
 */
export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  try {
    const body = patchSchema.parse(await request.json());
    const source = await prisma.scrapingSource.update({
      where: { id: body.id },
      data: {
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
        ...(body.selectorsConfig != null
          ? { selectorsConfig: body.selectorsConfig as object }
          : {}),
      },
    });
    return NextResponse.json({ source });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

/**
 * Dispara scraping manual vía GitHub Actions workflow_dispatch.
 */
export async function POST(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) return auth.error;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      {
        error:
          'GITHUB_TOKEN y GITHUB_REPO no configurados. El scraping programado sigue activo en Actions.',
      },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { sourceSlug?: string };

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/scraping.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: { source: body.sourceSlug ?? 'all' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: text }, { status: 502 });
  }

  await prisma.systemLog.create({
    data: {
      category: 'ADMIN',
      message: `Scraping manual disparado (${body.sourceSlug ?? 'all'})`,
      userId: auth.user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
