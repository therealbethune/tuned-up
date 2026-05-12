import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, ratings, follows, users } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the viewer's own rating + ratings from accepted follows for a
// given song. Used by the rating sheet to surface social context while
// you're deciding on your score.
//
// GET /api/songs/[songId]/social-ratings
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ songId: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Next.js already decodes dynamic-segment params once before handing
  // them to the route handler. The previous `decodeURIComponent` call
  // here applied a second decode, which mangles any id that legitimately
  // contains a literal `%XX` byte (e.g. encoded spaces inside synthetic
  // ids). Use the param as-is.
  const { songId: decoded } = await params;

  // Whom does this user follow?
  const followed = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, userId), eq(follows.status, "accepted")));
  const ids = followed.map((f) => f.id);

  // The viewer's own rating (so the sheet can pre-fill, even if the caller
  // didn't pass it through props).
  const [mine] = await db
    .select({
      score: ratings.score,
      review: ratings.review,
    })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, decoded)))
    .limit(1);

  // Friends' ratings.
  const friendRatings = ids.length
    ? await db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          score: ratings.score,
          review: ratings.review,
          createdAt: ratings.createdAt,
        })
        .from(ratings)
        .innerJoin(users, eq(users.id, ratings.userId))
        .where(and(inArray(ratings.userId, ids), eq(ratings.songId, decoded)))
        .orderBy(desc(ratings.createdAt))
        .limit(20)
    : [];

  return NextResponse.json({
    mine: mine ?? null,
    friends: friendRatings,
  });
}
