import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, ilike, or, sql, desc, eq, count, inArray, notInArray } from "drizzle-orm";
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
  // Single-char searches are useful for short handles like "j".
  if (q.length < 1 || q.length > 64) return NextResponse.json({ results: [] });

  // Escape LIKE wildcards so a user typing "ab_c" doesn't match "abXc"
  // (where X is any char). Backslash is Postgres' default escape.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;
  const lowerQ = q.toLowerCase();
  const lowerPrefix = `${safe.toLowerCase()}%`;

  // Hide anyone on either side of a block edge with the viewer so
  // the search bar can't circumvent a block.
  const { hiddenIds } = await getBlockEdges(userId);

  // Sort by match quality:
  //   0 = exact-match on username (rare; gets to top)
  //   1 = prefix-match on username or displayName
  //   2 = contains-only match
  // Then by ratings count desc. We compute the sort key in SQL so
  // pagination + LIMIT 20 still picks the most relevant rows.
  const baseWhere = and(
    or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
    // Hide private users from search results — but always keep the
    // viewer themselves discoverable for self-@-mention.
    or(eq(users.isPrivate, false), eq(users.id, userId)),
    hiddenIds.length > 0 ? notInArray(users.id, hiddenIds) : undefined,
  );

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
    .where(baseWhere)
    .groupBy(users.id)
    .orderBy(
      // Inline the CASE in the ORDER BY rather than referencing an
      // alias — Drizzle's select-side camelCase aliases get quoted
      // ("matchScore") which breaks unquoted column references in
      // the ORDER BY clause.
      sql`CASE
            WHEN LOWER(${users.username}) = ${lowerQ} THEN 0
            WHEN LOWER(${users.username}) LIKE ${lowerPrefix} THEN 1
            WHEN LOWER(COALESCE(${users.displayName}, '')) LIKE ${lowerPrefix} THEN 1
            ELSE 2
          END`,
      desc(sql`count(${ratings.userId})`),
    )
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
