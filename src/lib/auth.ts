import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

/**
 * Login propio con email y contraseña: la conexión con Facebook es por tenant
 * (`/api/connect/facebook/start`) y no forma parte de la sesión.
 */
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  // Con CredentialsProvider las sesiones se guardan en un JWT.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email y contraseña",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }

      // Se revalida en cada request para que los cambios de rol o de cuenta
      // impacten sin necesidad de volver a iniciar sesión.
      if (!token.id) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, name: true, email: true, role: true, tenantId: true },
      });

      if (!dbUser) {
        delete token.id;
        delete token.role;
        delete token.tenantId;
        return token;
      }

      token.id = dbUser.id;
      token.name = dbUser.name;
      token.email = dbUser.email;
      token.role = dbUser.role;
      token.tenantId = dbUser.tenantId;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id ?? "";
        session.user.role = token.role ?? "CLIENT";
        session.user.tenantId = token.tenantId ?? null;
      }
      return session;
    },
  },
};
