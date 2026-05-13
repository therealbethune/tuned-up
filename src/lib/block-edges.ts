import { and, eq, or } from "drizzle-orm";
import { db, blocks } from "@/db";
import { safeQuery } from "@/lib/safe-query";

// Block edges are bidirectional for visibility purposes — when user A
// blocks B, B can't see A's content either. Most surfaces in the app
// (feed, comments, likes, suggestions, profile, recommendations,
// activity, leaderboard, taste-twins, etc.) need the same pattern:
//
//   1. SELECT every block row where viewer is the blocker OR blockee
//   2. Reduce to a flat Set<otherUserId> of "people to hide from view"
//
// This helper exists so that loop runs once per request consistently,
// rather than being inlined in 7+ places with subtle drift.

export async function getBlockEdges(viewerId: string): Promise<{
  hiddenIds: string[];
  hiddenSet: Set<string>;
}> {
  const rows = await safeQuery(
    () =>
      db
        .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
        .from(blocks)
        .where(or(eq(blocks.blockerId, viewerId), eq(blocks.blockedId, viewerId))),
    [] as { blockerId: string; blockedId: string }[],
    "block-edges",
  );
  const set = new Set<string>();
  for (const r of rows) {
    set.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
  }
  return { hiddenIds: Array.from(set), hiddenSet: set };
}

// One-off variant for the "is there a block edge between A and B?"
// gate used by write-side guards (likes/comments/recs/follows POST).
// Returns true if either side has blocked the other.
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [row] = await db
    .select({ blockerId: blocks.blockerId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.blockerId, a), eq(blocks.blockedId, b)),
        and(eq(blocks.blockerId, b), eq(blocks.blockedId, a)),
      ),
    )
    .limit(1);
  return Boolean(row);
}
