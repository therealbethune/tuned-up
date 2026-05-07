import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, comments, users, ratings, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/comments?u=<ratingUserId>&s=<songId>
// Returns the list of comments for a single (ratingUserId, songId) target,
// each enriched with the commenter's score on the same song (if they have one).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const ratingUserId = url.searchParams.get("u");
  const songId = url.searchParams.get("s");
  if (!ratingUserId || !songId) {
    return NextResponse.json({ error: "u and s required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      commenterId: comments.commenterId,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      score: ratings.score,
      review: ratings.review,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.commenterId))
    .leftJoin(
      ratings,
      and(eq(ratings.userId, comments.commenterId), eq(ratings.songId, comments.songId)),
    )
    .where(and(eq(comments.ratingUserId, ratingUserId), eq(comments.songId, songId)))
    .orderBy(asc(comments.createdAt))
    .limit(200);

  return NextResponse.json({ comments: rows });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { ratingUserId, songId, body } = (await req.json().catch(() => ({}))) ?? {};
  const text = (body ?? "").toString().trim();
  if (!ratingUserId || !songId || !text) {
    return NextResponse.json({ error: "ratingUserId, songId, and body are required" }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: "comment too long" }, { status: 400 });
  }

  // Confirm the rating exists; FK would catch this but the error is friendlier here.
  const [r] = await db
    .select({ userId: ratings.userId })
    .from(ratings)
    .where(and(eq(ratings.userId, ratingUserId), eq(ratings.songId, songId)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "rating not found" }, { status: 404 });

  const id = randomUUID();
  await db.insert(comments).values({
    id,
    ratingUserId,
    songId,
    commenterId: userId,
    body: text,
  });

  // Notify the rating owner unless they're commenting on their own rating.
  if (ratingUserId !== userId) {
    await db.insert(activities).values({
      id: randomUUID(),
      userId: ratingUserId,
      actorId: userId,
      type: "comment",
      songId,
    });
  }

  // Return the new comment with commenter info to avoid a second round-trip.
  const [me] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [myRating] = await db
    .select({ score: ratings.score, review: ratings.review })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)))
    .limit(1);

  return NextResponse.json({
    comment: {
      id,
      body: text,
      createdAt: new Date(),
      commenterId: userId,
      username: me?.username,
      displayName: me?.displayName,
      imageUrl: me?.imageUrl,
      score: myRating?.score ?? null,
      review: myRating?.review ?? null,
    },
  });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { commentId } = (await req.json().catch(() => ({}))) ?? {};
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  // Only the commenter (or the rating owner) can delete.
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.commenterId !== userId && c.ratingUserId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await db.delete(comments).where(eq(comments.id, commentId));
  return NextResponse.json({ ok: true });
}

// (asc/desc imports kept for future tooling; silence unused warning)
void desc;
