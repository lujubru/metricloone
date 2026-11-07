import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { publishPostById } from "@/lib/publisher";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await context.params;
    const outcome = await publishPostById(id, session.user.id);

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
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
