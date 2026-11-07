import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { publishPostById } from "@/lib/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const { id } = await context.params;
    const outcome = await publishPostById(id, auth.tenantId);

    if (!outcome) {
      return NextResponse.json(
        { error: "El post no existe o ya se está publicando" },
        { status: 409 }
      );
    }

    if (outcome.status === "PUBLISHED") {
      return NextResponse.json({ success: true, status: outcome.status });
    }

    return NextResponse.json(
      { error: outcome.errorMessage || "No se pudo publicar el post", status: outcome.status },
      { status: 502 }
    );
  } catch (error) {
    console.error("Error al publicar el post:", error);
    return serverError();
  }
}
