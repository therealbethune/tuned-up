import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, ilike, or, sql, desc, eq, count, inArray } from "drizzle-orm";
import { db, users, ratings, follows } from "@/db";
import { getBlockEdges } from "@/lib/block-edges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/users/search?q=...
// Returns rows shaped for the /people page + @-mention picker. Each
// row includes a `followStatus` so the inline Follow button in the
// search UI starts in the correct state without a second roundtrip.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  // Accept single-char searches now — useful for short handles like
  // "j" or "kc". Still gates empty/long.
  if (q.length < 1) return NextResponse.json({ results: [] });
  if (q.length > 64) return NextResponse.json({ results: [] });

  // Escape LIKE wildcards so a user typing "ab_c" doesn't match "abXc"
  // (where X is any char). Backslash is the default escape in Postgres.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;
  // Prefix-match pattern — rows that START with the query rank
  // higher than rows that only contain it somewhere in the middle.
  const prefix = `${safe}%`;

  // Hide anyone on either side of a block edge with the viewer so
  // the search bar can't be used to circumvent a block.
  const { hiddenIds } = await getBlockEdges(userId);

  // Score order: exact match first (1), then prefix match (2), then
  // generic match (3); break ties by rating count desc.
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      ratingsCount: count(ratings.userId),
      matchScore: sql<number>`
        CASE
          WHEN lower(${users.username}) = lower(${q}) THEN 1
          WHEN lower(${users.username}) LIKE lower(${prefix}) THEN 2
          WHEN lower(${users.displayName}) LIKE lower(${prefix}) THEN 2
          ELSE 3
        END
      `,
    })
    .from(users)
    .leftJoin(ratings, eq(ratings.userId, users.id))
    .where(
      and(
        or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
        // Hide private users from search results — but always keep
        // the viewer themselves discoverable for self-@-mention.
        or(eq(users.isPrivate, false), eq(users.id, userId)),
        hiddenIds.length > 0 ? sql`${users.id} NOT IN ${hiddenIds}` : sql`true`,
      ),
    )
    .groupBy(users.id)
    .orderBy(sql`match_score asc`, desc(sql`count(${ratings.userId})`))
    .limit(20);

  // Resolve the viewer's follow status against each result in one
  // batched query rather than N+1 lookups.
  const ids = rows.map((r) => r.id).filter((id) => id !== userId);
  let followStatus = new Map<string, "accepted" | "pending">();
  if (ids.length > 0) {
    const edges = await db
      .select({ followeeId: follows.followeeId, status: follows.status })
      .from(follows)
      .where(and(eq(follows.followerId, userId), inArray(follows.followeeId, ids)));
    followStatus = new Map(
      edges.map((e) => [e.followeeId, e.status === "pending" ? "pending" : "accepted"]),
    );
  }

  return NextResponse.json({
    results: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      imageUrl: r.imageUrl,
      ratingsCount: r.ratingsCount,
      followStatus: r.id === userId ? "self" : (followStatus.get(r.id) ?? "none"),
    })),
  });
}
