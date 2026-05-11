import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, ratings } from "@/db";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Updates an existing rating's score/review without requiring the full
// song metadata (the song row already exists). Used by the inline edit
// form on /me.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { songId, score, review } = (await req.json().catch(() => ({}))) ?? {};
  if (!songId || typeof songId !== "string" || songId.length > 256) {
    return NextResponse.json({ error: "invalid songId" }, { status: 400 });
  }
  if (review != null && (typeof review !== "string" || review.length > 5000)) {
    return NextResponse.json({ error: "review too long" }, { status: 400 });
  }
  const s = Number(score);
  if (!Number.isFinite(s) || s < 1 || s > 100) {
    return NextResponse.json({ error: "score must be 1-100" }, { status: 400 });
  }

  // Rate-limit edits the same way creates are limited. Without this a
  // script could spam updatedAt on a single rating row uncapped.
  const limited = await enforce(LIMITS.RATINGS, async () => {
    const start = windowStartDate(LIMITS.RATINGS.windowSec);
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), gte(ratings.updatedAt, start)));
    return Number(r?.c ?? 0);
  });
  if (limited) return limited;

  const result = await db
    .update(ratings)
    .set({ score: Math.round(s), review: review ?? null, updatedAt: new Date() })
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)))
    .returning({ songId: ratings.songId });

  if (result.length === 0) return NextResponse.json({ error: "rating not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
