import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, count, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, likes, ratings, activities, users, songs } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";
import { encodeBase64Url } from "@/lib/encoding";
import { canViewRatingsFrom } from "@/lib/visibility";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";

export const runtime = "nodejs";

// GET /api/likes?u=<ratingUserId>&s=<songId>
// Returns: { likers: [{ id, username, displayName, imageUrl, createdAt }] }
// Most-recent first.
//
// Privacy: if the rating owner is private and the viewer doesn't follow
// them, return 403 — like-count is still derivable from the public POST
// response, but who liked is a personal detail of the private owner's
// social graph.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const ratingUserId = url.searchParams.get("u");
  const songId = url.searchParams.get("s");
  if (!ratingUserId || !songId) {
    return NextResponse.json({ error: "u and s required" }, { status: 400 });
  }
  if (!(await canViewRatingsFrom(userId, ratingUserId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      createdAt: likes.createdAt,
    })
    .from(likes)
    .innerJoin(users, eq(users.id, likes.likerId))
    .where(and(eq(likes.ratingUserId, ratingUserId), eq(likes.songId, songId)))
    .orderBy(desc(likes.createdAt))
    .limit(200);

  return NextResponse.json({ likers: rows });
}

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

  // Rate-limit toggle traffic. Likes can be spammed by holding down a
  // button — 60/min is far past any human-paced UI and still blocks
  // abuse. The toggle counts creates only; an unlike doesn't increment.
  const limited = await enforce(LIMITS.LIKES, async () => {
    const start = windowStartDate(LIMITS.LIKES.windowSec);
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(likes)
      .where(and(eq(likes.likerId, userId), gte(likes.createdAt, start)));
    return Number(r?.c ?? 0);
  });
  if (limited) return limited;

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
        ratingUserId,
      });

      // Push to the rating owner. Batch the actor + song lookups (they're
      // independent) instead of awaiting them serially.
      const [actor, song] = await Promise.all([
        db
          .select({ displayName: users.displayName, username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then((r) => r[0]),
        db
          .select({ title: songs.title })
          .from(songs)
          .where(eq(songs.id, songId))
          .limit(1)
          .then((r) => r[0]),
      ]);
      const actorName = actor?.displayName || actor?.username || "Someone";
      await sendPushToUser(ratingUserId, {
        title: `${actorName} liked your rating`,
        body: song ? `❤️ ${song.title}` : "Open Tuned Up to see.",
        // Rating owner = recipient. Use focus-param URL so the feed
        // page always shows the card and the in-page anchor scrolls.
        url: `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`,
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
