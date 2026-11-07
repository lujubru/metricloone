import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { badRequest, requireAdmin, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const SALT_ROUNDS = 10;

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = base || "cuenta";
  let slug = root;
  let suffix = 2;

  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

/** Lista de cuentas con sus usuarios y páginas conectadas. */
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const tenants = await prisma.tenant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        fbAppId: true,
        fbAppSecret: true,
        createdAt: true,
        fbConnection: { select: { fbUserName: true, tokenExpiresAt: true } },
        users: { select: { id: true, name: true, email: true, role: true }, orderBy: { name: "asc" } },
        _count: { select: { socialProfiles: true, posts: true } },
      },
    });

    return NextResponse.json({
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        fbAppId: tenant.fbAppId,
        hasAppSecret: Boolean(tenant.fbAppSecret),
        createdAt: tenant.createdAt,
        facebook: tenant.fbConnection,
        users: tenant.users,
        profilesCount: tenant._count.socialProfiles,
        postsCount: tenant._count.posts,
      })),
    });
  } catch (error) {
    console.error("Error al listar las cuentas:", error);
    return serverError();
  }
}

/**
 * Crea una cuenta (cliente) junto con su usuario de acceso. Las credenciales
 * de la app de Facebook son opcionales al crear y se pueden cargar después.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const fbAppId = typeof body?.fbAppId === "string" ? body.fbAppId.trim() : "";
    const fbAppSecret = typeof body?.fbAppSecret === "string" ? body.fbAppSecret.trim() : "";

    if (!name) return badRequest("El nombre de la cuenta es obligatorio");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest("El email es inválido");
    if (password.length < 8) return badRequest("La contraseña debe tener al menos 8 caracteres");
    if (fbAppId && !fbAppSecret) return badRequest("Si cargás el App ID también necesitás el App Secret");
    if (fbAppSecret && !fbAppId) return badRequest("Si cargás el App Secret también necesitás el App ID");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return badRequest("Ya existe un usuario con ese email");

    const slug = await uniqueSlug(slugify(name));
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        fbAppId: fbAppId || null,
        fbAppSecret: fbAppSecret ? encryptSecret(fbAppSecret) : null,
        users: {
          create: {
            name,
            email,
            passwordHash,
            role: "CLIENT",
          },
        },
      },
      select: { id: true, name: true, slug: true },
    });

    return NextResponse.json({ success: true, tenant }, { status: 201 });
  } catch (error) {
    console.error("Error al crear la cuenta:", error);
    return serverError();
  }
}
