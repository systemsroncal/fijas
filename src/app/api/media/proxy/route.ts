import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMediaHost } from '@/lib/media-proxy';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Proxy de imágenes TheSportsDB (same-origin) para canvas / html-to-image.
 * Solo hosts allowlist; evita CORS de r2.thesportsdb.com.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url');
  if (!raw || !isAllowedMediaHost(raw)) {
    return NextResponse.json({ error: 'URL no permitida' }, { status: 400 });
  }

  try {
    const upstream = await fetch(raw, {
      headers: { Accept: 'image/*,*/*' },
      next: { revalidate: 86400 },
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: 'Imagen no disponible' }, { status: 502 });
    }

    const ctype = upstream.headers.get('content-type') ?? 'image/png';
    if (!ctype.startsWith('image/')) {
      return NextResponse.json({ error: 'No es una imagen' }, { status: 415 });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Imagen demasiado grande' }, { status: 413 });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': ctype,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Error al obtener imagen' }, { status: 502 });
  }
}
