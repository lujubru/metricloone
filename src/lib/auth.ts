import { NextAuthOptions } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import FacebookProvider from "next-auth/providers/facebook";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

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
          scope:
            "email,public_profile,business_management,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish",
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
