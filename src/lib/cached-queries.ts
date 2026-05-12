import { cache } from "react";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, activities, spotifyAccounts } from "@/db";
import { safeQuery } from "@/lib/safe-query";

// Per-request memoized DB queries. React's `cache()` dedupes calls
// inside a single server render — so even though both /feed page and
// the layout's MobileTabBar (or two server components on the same
// page) ask for "is Spotify connected?" or "how many unread activities?",
// only one DB roundtrip happens per request.
//
// Without these, the previous code paths fired 1-2 redundant queries
// per page nav across the whole app. With Neon Launch billing at
// $0.106 / CU-hr, every roundtrip counts.

export const isSpotifyConnected = cache(async (userId: string): Promise<boolean> => {
  const rows = await safeQuery(
    () =>
      db
        .select({ id: spotifyAccounts.userId })
        .from(spotifyAccounts)
        .where(eq(spotifyAccounts.userId, userId))
        .limit(1),
    [] as { id: string }[],
    "cached-spotify-connected",
  );
  return rows.length > 0;
});

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
