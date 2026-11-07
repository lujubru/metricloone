import { NextResponse } from "next/server";
import { requireTenant, serverError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const profiles = await prisma.socialProfile.findMany({
      where: { tenantId: auth.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error("Error fetching profiles:", error);
    return serverError();
  }
}
