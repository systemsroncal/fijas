import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { validateApiSecret } from '@/lib/api-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Inicializa MySQL (db push + seed) sin consola.
 * POST /api/setup  Header: X-API-Secret: <API_SECRET>
 */
export async function POST(request: Request) {
  if (!validateApiSecret(request)) {
    return NextResponse.json({ error: 'Invalid API secret' }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: 'DATABASE_URL no configurada en el hosting' },
      { status: 500 }
    );
  }

  try {
    const out = execSync('node scripts/bootstrap-db.js', {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      timeout: 55_000,
    });

    return NextResponse.json({
      ok: true,
      message: 'Base de datos sincronizada y seed aplicado',
      log: out.slice(-1000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stderr =
      err && typeof err === 'object' && 'stderr' in err
        ? String((err as { stderr?: string }).stderr)
        : '';
    console.error('[setup]', message, stderr);
    return NextResponse.json(
      {
        error: 'Setup falló',
        detail: (stderr || message).slice(0, 800),
        hint: 'cPanel → Remote MySQL → añade %. DATABASE_URL con host público (no localhost).',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    hint: 'POST con header X-API-Secret para crear tablas y SuperAdmin',
  });
}
