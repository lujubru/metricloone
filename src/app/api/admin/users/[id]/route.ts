import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { badRequest, forbidden, requireAdmin, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SALT_ROUNDS = 10;

type Params = { params: Promise<{ id: string }> };

/** Actualiza nombre, email, rol o contraseña de un usuario. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    const body = await req.json().catch(() => null);
    const data: { name?: string; email?: string; passwordHash?: string; role?: string } = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return badRequest("El nombre no puede quedar vacío");
      data.name = name;
    }

    if (typeof body?.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("El email es inválido");
      if (email !== user.email) {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return badRequest("Ya existe un usuario con ese email");
      }
      data.email = email;
    }

    if (typeof body?.password === "string" && body.password.length > 0) {
      if (body.password.length < 8) return badRequest("La contraseña debe tener al menos 8 caracteres");
      data.passwordHash = await bcrypt.hash(body.password, SALT_ROUNDS);
    }

    if (body?.role === "ADMIN" || body?.role === "CLIENT") {
      // Evita que el admin logueado se quite a sí mismo el acceso.
      if (id === auth.user.id && body.role !== "ADMIN") {
        return forbidden("No podés quitarte el rol de administrador");
      }
      data.role = body.role;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, tenantId: true },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (error) {
    console.error("Error al actualizar el usuario:", error);
    return serverError();
  }
}

/** Elimina un usuario (no permite borrarse a sí mismo). */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const { id } = await params;
    if (id === auth.user.id) return forbidden("No podés eliminar tu propio usuario");

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error al eliminar el usuario:", error);
    return serverError();
  }
}
