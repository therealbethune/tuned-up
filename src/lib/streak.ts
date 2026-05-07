import { db, ratings } from "@/db";
import { eq, sql } from "drizzle-orm";

// Return the user's current consecutive-day rating streak.
// A streak counts back from today (or from yesterday if they haven't rated
// today yet — so users don't see their streak drop just because it's morning).
// Returns 0 if their last rating was 2+ days ago.
export async function computeStreak(userId: string): Promise<number> {
  const rows = await db
    .select({
      day: sql<string>`to_char(${ratings.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
    })
    .from(ratings)
    .where(eq(ratings.userId, userId))
    .groupBy(sql`to_char(${ratings.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${ratings.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD') desc`);

  if (rows.length === 0) return 0;

  const today = new Date();
  const yyyymmdd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const days = new Set(rows.map((r) => r.day));
  // Walk backward from today; if today isn't in the set, allow yesterday as
  // the start so an early-morning view doesn't read 0.
  let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (!days.has(yyyymmdd(cursor))) {
    cursor = new Date(cursor.getTime() - 86400000);
    if (!days.has(yyyymmdd(cursor))) return 0;
  }

  let streak = 0;
  while (days.has(yyyymmdd(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}
