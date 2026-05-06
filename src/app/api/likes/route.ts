import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, likes, ratings, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

export const runtime = "nodejs";

// Toggle like. Body: { ratingUserId, songId }
// Returns: { liked: boolean, count: number }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { ratingUserId, songId } = (await req.json().catch(() => ({}))) ?? {};
  if (!ratingUserId || !songId) {
    return NextResponse.json({ error: "ratingUserId and songId required" }, { status: 400 });
  }

  // The rating must exist (FK would catch this anyway).
  const [r] = await db
    .select({ userId: ratings.userId })
    .from(ratings)
    .where(and(eq(ratings.userId, ratingUserId), eq(ratings.songId, songId)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "rating not found" }, { status: 404 });

  const [existing] = await db
    .select()
    .from(likes)
    .where(
      and(
        eq(likes.ratingUserId, ratingUserId),
        eq(likes.songId, songId),
        eq(likes.likerId, userId),
      ),
    )
    .limit(1);

  let liked: boolean;
  if (existing) {
    await db
      .delete(likes)
      .where(
        and(
          eq(likes.ratingUserId, ratingUserId),
          eq(likes.songId, songId),
          eq(likes.likerId, userId),
        ),
      );
    liked = false;
  } else {
    await db
      .insert(likes)
      .values({ ratingUserId, songId, likerId: userId })
      .onConflictDoNothing();
    liked = true;

    // Activity for the rating owner — skip self-likes.
    if (ratingUserId !== userId) {
      // Dedup any prior 'like' activity from this actor on this rating, so
      // unlike→relike doesn't pile up entries.
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, ratingUserId),
            eq(activities.actorId, userId),
            eq(activities.type, "like"),
            eq(activities.songId, songId),
          ),
        );
      await db.insert(activities).values({
        id: randomUUID(),
        userId: ratingUserId,
        actorId: userId,
        type: "like",
        songId,
      });
    }
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(likes)
    .where(and(eq(likes.ratingUserId, ratingUserId), eq(likes.songId, songId)));

  return NextResponse.json({ liked, count: Number(n) });
}
