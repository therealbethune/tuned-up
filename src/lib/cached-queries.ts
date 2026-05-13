import { cache } from "react";
import { and, count, eq, isNull, notInArray, or } from "drizzle-orm";
import { db, activities, blocks } from "@/db";
import { safeQuery } from "@/lib/safe-query";

// Per-request memoized DB queries. React's `cache()` dedupes calls
// inside a single server render — so even though both the page and
// the layout's MobileTabBar ask for "how many unread activities?",
// only one DB roundtrip happens per request.

export const unreadActivityCount = cache(async (userId: string): Promise<number> => {
  // Block-aware: don't count activities authored by anyone the viewer
  // has blocked (or who blocked them). Keeps the bell badge honest
  // with what the user actually sees on /activity.
  const blockEdges = await safeQuery(
    () =>
      db
        .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
        .from(blocks)
        .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId))),
    [] as { blockerId: string; blockedId: string }[],
    "cached-unread-blocks",
  );
  const hiddenIds: string[] = [];
  for (const b of blockEdges) {
    hiddenIds.push(b.blockerId === userId ? b.blockedId : b.blockerId);
  }
  const [row] = await safeQuery(
    () =>
      db
        .select({ n: count() })
        .from(activities)
        .where(
          hiddenIds.length
            ? and(
                eq(activities.userId, userId),
                isNull(activities.readAt),
                notInArray(activities.actorId, hiddenIds),
              )
            : and(eq(activities.userId, userId), isNull(activities.readAt)),
        ),
    [{ n: 0 }],
    "cached-unread-activity-count",
  );
  return Number(row?.n ?? 0);
});
