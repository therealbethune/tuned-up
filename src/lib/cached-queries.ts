import { cache } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, activities } from "@/db";
import { safeQuery } from "@/lib/safe-query";

// Per-request memoized DB queries. React's `cache()` dedupes calls
// inside a single server render — so even though both the page and
// the layout's MobileTabBar ask for "how many unread activities?",
// only one DB roundtrip happens per request.

export const unreadActivityCount = cache(async (userId: string): Promise<number> => {
  const [row] = await safeQuery(
    () =>
      db
        .select({ n: count() })
        .from(activities)
        .where(and(eq(activities.userId, userId), isNull(activities.readAt))),
    [{ n: 0 }],
    "cached-unread-activity-count",
  );
  return Number(row?.n ?? 0);
});
