import { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import FacebookProvider from "next-auth/providers/facebook";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { FACEBOOK_SCOPE_STRING } from "./facebook";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as unknown as Adapter,
  providers: [
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID || "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
      authorization: {
        params: {
          // Permisos de páginas e Instagram (cuentas Business/Creator vinculadas a una Página).
          // business_management alcanza las Páginas que viven dentro de un Business Portfolio.
          // El listado vive en lib/facebook.ts para poder auditarlo contra el token.
          scope: FACEBOOK_SCOPE_STRING,
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        // Añadimos el ID del usuario a la sesión para poder usarlo en las consultas a la DB
        session.user.id = user.id;
      }
      return session;
    },
  },
};
