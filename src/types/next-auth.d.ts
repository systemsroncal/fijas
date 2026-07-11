import { NextAuthOptions } from 'next-auth';
import { Role } from '@prisma/client';

declare module 'next-auth' {
  interface Session {
    sessionToken?: string;
    error?: string;
    user: {
      id: string;
      role: Role;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    role?: Role;
    sessionToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: Role;
    sessionToken?: string;
    error?: string;
  }
}

export type { NextAuthOptions };
