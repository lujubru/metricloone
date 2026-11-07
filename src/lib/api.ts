import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type SessionUser = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  tenantId: string | null;
};

export const ADMIN_ROLE = "ADMIN";
export const CLIENT_ROLE = "CLIENT";

export function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

export function forbidden(message = "No tenés permiso para realizar esta acción") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverError(message = "Error interno del servidor") {
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Usuario de la sesión actual, o null si no hay sesión válida. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user?.id) return null;

  return {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role ?? CLIENT_ROLE,
    tenantId: user.tenantId ?? null,
  };
}

export type TenantAuth = { user: SessionUser; tenantId: string };

/**
 * Exige sesión y cuenta asignada: casi todas las rutas de la app trabajan
 * sobre el tenant del usuario, no sobre el usuario en particular.
 */
export async function requireTenant(): Promise<TenantAuth | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { response: unauthorized() };

  if (!user.tenantId) {
    return {
      response: forbidden("Tu usuario todavía no tiene una cuenta asignada. Contactá al administrador."),
    };
  }

  return { user, tenantId: user.tenantId };
}

/** Exige rol ADMIN (dueño de la plataforma). */
export async function requireAdmin(): Promise<TenantAuth | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { response: unauthorized() };
  if (user.role !== ADMIN_ROLE) return { response: forbidden("Solo el administrador puede hacer esto") };
  if (!user.tenantId) {
    return { response: forbidden("El administrador no tiene una cuenta asignada.") };
  }
  return { user, tenantId: user.tenantId };
}
