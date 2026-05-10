import { db, ratings, users } from "@/db";
import { eq, sql } from "drizzle-orm";
import { dateStringInTimezone } from "@/lib/timezone";

// Return the user's current consecutive-day rating streak.
// A streak counts back from today (or from yesterday if they haven't rated
// today yet — so users don't see their streak drop just because it's morning).
// Returns 0 if their last rating was 2+ days ago.
//
// Timezone-aware: uses the user's stored IANA tz so a PST user's 11pm
// rating is "today", not tomorrow per UTC. Falls back to UTC if no tz set.
//
// Performance note: this fetches one row per DISTINCT day (via GROUP BY),
// not one row per rating. For an active user that's at most ~365 rows/yr —
// totally fine. An earlier rewrite to a SQL window function tried to be
// cleverer and broke; this version is the boring-and-correct baseline.
export async function computeStreak(userId: string): Promise<number> {
  const [u] = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = u?.tz || "UTC";

  const rows = await db
    .select({
      day: sql<string>`to_char(${ratings.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
    })
    .from(ratings)
    .where(eq(ratings.userId, userId))
    .groupBy(sql`to_char(${ratings.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${ratings.createdAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD') desc`);

  if (rows.length === 0) return 0;

  const days = new Set(rows.map((r) => r.day));
  const now = new Date();

  // What's "today" in the user's tz?
  const todayStr = dateStringInTimezone(now, tz);
  const [yy, mm, dd] = todayStr.split("-").map(Number);
  let cursor = new Date(Date.UTC(yy, mm - 1, dd));
  const cursorStr = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  if (!days.has(cursorStr(cursor))) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (!days.has(cursorStr(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(cursorStr(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}
