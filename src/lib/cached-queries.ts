import { cache } from "react";
import { and, count, eq, isNull, notInArray } from "drizzle-orm";
import { db, activities } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { getBlockEdges } from "@/lib/block-edges";

// Per-request memoized DB queries. React's `cache()` dedupes calls
// inside a single server render — so even though both the page and
// the layout's MobileTabBar ask for "how many unread activities?",
// only one DB roundtrip happens per request.

export const unreadActivityCount = cache(async (userId: string): Promise<number> => {
  // Block-aware: don't count activities authored by anyone the viewer
  // has blocked (or who blocked them). Keeps the bell badge honest
  // with what the user actually sees on /activity.
  const { hiddenIds } = await getBlockEdges(userId);
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
