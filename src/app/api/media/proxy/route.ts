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

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) {
      return NextResponse.json({ error: 'Imagen demasiado grande' }, { status: 413 });
    }
    if (buf.length < 24) {
      return NextResponse.json({ error: 'Imagen vacía' }, { status: 502 });
    }

    // Algunos CDN responden application/octet-stream; inferir por magic bytes
    let ctype = upstream.headers.get('content-type') ?? '';
    if (!ctype.startsWith('image/')) {
      if (buf[0] === 0x89 && buf[1] === 0x50) ctype = 'image/png';
      else if (buf[0] === 0xff && buf[1] === 0xd8) ctype = 'image/jpeg';
      else if (buf[0] === 0x47 && buf[1] === 0x49) ctype = 'image/gif';
      else if (buf[0] === 0x52 && buf[1] === 0x49) ctype = 'image/webp';
      else ctype = 'image/png';
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
