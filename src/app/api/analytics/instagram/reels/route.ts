import { NextResponse } from "next/server";
import { accessibleProfileWhere, requireTenant, serverError } from "@/lib/api";
import { FacebookApiError } from "@/lib/facebook";
import { getInstagramReelInsights, INSTAGRAM_PLATFORM } from "@/lib/instagram";
import { isVideoUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const REEL_LIMIT = 20;
const INSIGHTS_CONCURRENCY = 4;

export async function GET() {
  try {
    const auth = await requireTenant();
    if ("response" in auth) return auth.response;

    const reels: Array<
      {
        id: string;
        content: string;
        mediaUrls: string[];
        publishedAt: Date | null;
        facebookPostId: string;
        socialProfile: { username: string | null; profileId: string; accessToken: string };
      }
    > = [];
    let cursor: { id: string } | undefined;

    while (reels.length < REEL_LIMIT) {
      const posts = await prisma.post.findMany({
        where: {
          tenantId: auth.tenantId,
          status: "PUBLISHED",
          postType: "POST",
          publishedAt: { not: null },
          facebookPostId: { not: null },
          socialProfile: { is: { ...accessibleProfileWhere(auth), platform: INSTAGRAM_PLATFORM } },
        },
        select: {
          id: true,
          content: true,
          mediaUrls: true,
          publishedAt: true,
          facebookPostId: true,
          socialProfile: {
            select: { username: true, profileId: true, accessToken: true },
          },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor, skip: 1 } : {}),
        take: 100,
      });

      const videoPosts = posts.filter(
        (post): post is (typeof posts)[number] & { facebookPostId: string } =>
          post.facebookPostId !== null &&
          post.mediaUrls.length === 1 &&
          isVideoUrl(post.mediaUrls[0])
      );
      reels.push(...videoPosts.slice(0, REEL_LIMIT - reels.length));

      if (reels.length === REEL_LIMIT || posts.length < 100) break;
      cursor = { id: posts[posts.length - 1].id };
    }

    const results: {
      postId: string;
      caption: string;
      account: string;
      publishedAt: Date | null;
      insights: Awaited<ReturnType<typeof getInstagramReelInsights>> | null;
      error: string | null;
    }[] = [];

    for (let index = 0; index < reels.length; index += INSIGHTS_CONCURRENCY) {
      const batch = reels.slice(index, index + INSIGHTS_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (post) => {
          try {
            const insights = await getInstagramReelInsights(
              post.facebookPostId,
              post.socialProfile.accessToken
            );
            return {
              postId: post.id,
              caption: post.content,
              account: post.socialProfile.username || post.socialProfile.profileId,
              publishedAt: post.publishedAt,
              insights,
              error: null,
            };
          } catch (error) {
            if (!(error instanceof FacebookApiError)) throw error;
            const permissionHint =
              error.code === 10 || error.code === 200
                ? " Verifica instagram_manage_insights y vuelve a conectar la cuenta."
                : "";
            return {
              postId: post.id,
              caption: post.content,
              account: post.socialProfile.username || post.socialProfile.profileId,
              publishedAt: post.publishedAt,
              insights: null,
              error: `${error.message}${permissionHint}`,
            };
          }
        })
      );
      results.push(...batchResults);
    }

    return NextResponse.json({ reels: results });
  } catch (error) {
    if (error instanceof FacebookApiError) {
      const permissionHint =
        error.code === 10 || error.code === 200
          ? " Verifica que la app tenga el permiso instagram_manage_insights y vuelve a conectar la cuenta."
          : "";
      return NextResponse.json({ error: `${error.message}${permissionHint}` }, { status: 400 });
    }
    console.error("Error al obtener métricas de Instagram:", error);
    return serverError();
  }
}
