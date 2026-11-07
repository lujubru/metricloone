import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SALT_ROUNDS = 10;

/** Lista de usuarios de todas las cuentas. */
export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const tenantId = new URL(req.url).searchParams.get("tenantId") ?? undefined;

    const users = await prisma.user.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        tenant: { select: { name: true } },
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error al listar los usuarios:", error);
    return serverError();
  }
}

/** Crea un usuario adicional dentro de una cuenta existente. */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId : "";
    const role = body?.role === "ADMIN" ? "ADMIN" : "CLIENT";

    if (!name) return badRequest("El nombre es obligatorio");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("El email es inválido");
    if (password.length < 8) return badRequest("La contraseña debe tener al menos 8 caracteres");
    if (!tenantId) return badRequest("Elegí una cuenta");

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return badRequest("La cuenta seleccionada no existe");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("Ya existe un usuario con ese email");

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: await bcrypt.hash(password, SALT_ROUNDS),
        role,
        tenantId,
      },
      select: { id: true, name: true, email: true, role: true, tenantId: true },
    });

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error("Error al crear el usuario:", error);
    return serverError();
  }
}
