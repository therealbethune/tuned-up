import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, count } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, likes, ratings, activities, users, songs } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";

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
    // Drop the corresponding activity row so unlikes don't leave dangling
    // notifications. Best-effort.
    if (ratingUserId !== userId) {
      try {
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
      } catch {
        /* swallow */
      }
    }
    liked = false;
  } else {
    // Use the unique constraint as the single source of truth: if a parallel
    // request beat us to it, onConflictDoNothing returns 0 affected rows and
    // we skip the side-effects (no double activity, no double push).
    const inserted = await db
      .insert(likes)
      .values({ ratingUserId, songId, likerId: userId })
      .onConflictDoNothing()
      .returning({ likerId: likes.likerId });
    const wasFirstInsert = inserted.length > 0;
    liked = true;

    // Activity for the rating owner — skip self-likes and skip if this was
    // a duplicate insert (race lost).
    if (ratingUserId !== userId && wasFirstInsert) {
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

      // Push to the rating owner.
      const [actor] = await db
        .select({ displayName: users.displayName, username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const [song] = await db
        .select({ title: songs.title })
        .from(songs)
        .where(eq(songs.id, songId))
        .limit(1);
      const actorName = actor?.displayName || actor?.username || "Someone";
      await sendPushToUser(ratingUserId, {
        title: `${actorName} liked your rating`,
        body: song ? `❤️ ${song.title}` : "Open Tuned Up to see.",
        url: `/u/${actor?.username ?? ""}`,
        tag: `like:${userId}:${songId}`,
      });
    }
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(likes)
    .where(and(eq(likes.ratingUserId, ratingUserId), eq(likes.songId, songId)));

  return NextResponse.json({ liked, count: Number(n) });
}
