import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { Adapter } from 'next-auth/adapters';
import { LogCategory, Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { canOpenNewSession } from '@/lib/session-control';

/**
 * Configuración NextAuth con Credentials + sesiones en MySQL (sin Redis).
 * Usamos strategy "database" creando Session manualmente tras validar credenciales.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email y contraseña son obligatorios');
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user || !user.passwordHash || !user.isActive) {
          await prisma.systemLog.create({
            data: {
              category: LogCategory.AUTH,
              level: 'warn',
              message: `Login fallido para ${credentials.email}`,
            },
          });
          throw new Error('Credenciales inválidas');
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          await prisma.systemLog.create({
            data: {
              category: LogCategory.AUTH,
              level: 'warn',
              message: `Contraseña incorrecta para ${user.email}`,
              userId: user.id,
            },
          });
          throw new Error('Credenciales inválidas');
        }

        const sessionCheck = await canOpenNewSession(user.id, user.role, user.maxSessions);
        if (!sessionCheck.ok) {
          await prisma.systemLog.create({
            data: {
              category: LogCategory.AUTH,
              level: 'warn',
              message: sessionCheck.message,
              userId: user.id,
            },
          });
          throw new Error(sessionCheck.message);
        }

        // Crear registro de sesión en MySQL para control de concurrencia
        const sessionToken = randomUUID();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await prisma.session.create({
          data: {
            sessionToken,
            userId: user.id,
            expires,
          },
        });

        await prisma.systemLog.create({
          data: {
            category: LogCategory.AUTH,
            level: 'info',
            message: `Login exitoso: ${user.email}`,
            userId: user.id,
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.username ?? user.email,
          role: user.role,
          sessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role;
        token.sessionToken = (user as { sessionToken?: string }).sessionToken;
      }

      // Validar que la sesión siga existiendo en MySQL
      if (token.sessionToken) {
        const dbSession = await prisma.session.findUnique({
          where: { sessionToken: token.sessionToken as string },
        });
        if (!dbSession || dbSession.expires < new Date()) {
          return { ...token, error: 'SessionInvalid' };
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token.error === 'SessionInvalid') {
        return { ...session, error: 'SessionInvalid' };
      }
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
        (session as { sessionToken?: string }).sessionToken = token.sessionToken as string;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      const token = (message as { token?: { sessionToken?: string } }).token;
      if (token?.sessionToken) {
        await prisma.session.deleteMany({
          where: { sessionToken: token.sessionToken },
        });
      }
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
