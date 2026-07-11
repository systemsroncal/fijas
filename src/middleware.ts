import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Protege rutas del dashboard. Login y APIs públicas quedan fuera.
 * basePath /wps-admin es manejado por Next.js automáticamente.
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (token?.error === 'SessionInvalid') {
      const login = new URL('/login', req.url);
      login.searchParams.set('error', 'SessionInvalid');
      return NextResponse.redirect(login);
    }

    if (path.startsWith('/admin') && token?.role !== 'SUPERADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        if (path.startsWith('/login') || path.startsWith('/register')) {
          return true;
        }
        if (path.startsWith('/api/auth') || path.startsWith('/api/scraping/ingest')) {
          return true;
        }
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/accumulators/:path*',
    '/analyses/:path*',
    '/settings/:path*',
    '/admin/:path*',
    '/api/matches/:path*',
    '/api/api-keys/:path*',
    '/api/accumulators/:path*',
    '/api/analyses/:path*',
    '/api/admin/:path*',
  ],
};
