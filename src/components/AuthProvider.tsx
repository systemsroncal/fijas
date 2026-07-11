'use client';

import { SessionProvider } from 'next-auth/react';
import { getBasePath } from '@/lib/paths';

/**
 * Provider de sesión NextAuth para el cliente.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const base = getBasePath();
  return <SessionProvider basePath={`${base}/api/auth`}>{children}</SessionProvider>;
}
