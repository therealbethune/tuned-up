import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql, desc, eq, and, ne, notInArray, count } from "drizzle-orm";
import { db, users, follows, ratings } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Find the people I already follow so we can exclude them.
  const followed = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId));
  const exclude = new Set<string>([userId, ...followed.map((f) => f.id)]);
  const excludeArr = [...exclude];

  // Top raters by song count, excluding self + already-followed.
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      ratingsCount: count(ratings.userId),
    })
    .from(users)
    .leftJoin(ratings, eq(ratings.userId, users.id))
    .where(notInArray(users.id, excludeArr))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${ratings.userId})`))
    .limit(10);

  return NextResponse.json({ results: rows.filter((r) => r.ratingsCount > 0) });
}
