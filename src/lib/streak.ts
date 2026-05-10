import { db, users } from "@/db";
import { eq, sql } from "drizzle-orm";

// Return the user's current consecutive-day rating streak.
// A streak counts back from today (or from yesterday if they haven't rated
// today yet — so users don't see their streak drop just because it's morning).
// Returns 0 if their last rating was 2+ days ago.
//
// Timezone-aware: uses the user's stored IANA tz so a PST user's 11pm
// rating is "today", not tomorrow per UTC. Falls back to UTC if no tz set.
//
// Performance: previously fetched all of a user's rating rows, grouped
// in JS, and walked the Set day-by-day. Now a single SQL query uses a
// gap-detection trick — `(date - row_number * INTERVAL '1 day')` is
// constant within a consecutive-day run — to find the most recent run
// of consecutive days. Scales O(active days), not O(ratings).
export async function computeStreak(userId: string): Promise<number> {
  const [u] = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = u?.tz || "UTC";

  // We accept "rated today OR yesterday" as the head of the streak so users
  // viewing in the morning before they've rated yet don't see it drop.
  // Gap-detection trick: subtracting `row_number * 1 day` from the day
  // produces the same anchor date for every member of a consecutive run,
  // so we just count rows whose anchor matches the head of the most
  // recent run.
  const result = await db.execute(sql`
    WITH local_days AS (
      SELECT DISTINCT (created_at AT TIME ZONE ${tz})::date AS day
      FROM ratings
      WHERE user_id = ${userId}
    ),
    today AS (
      SELECT (NOW() AT TIME ZONE ${tz})::date AS d
    ),
    head AS (
      SELECT MAX(day) AS d FROM local_days
      WHERE day >= (SELECT d FROM today) - INTERVAL '1 day'
    ),
    runs AS (
      SELECT day,
             day - (ROW_NUMBER() OVER (ORDER BY day DESC) || ' days')::INTERVAL AS anchor
      FROM local_days
      WHERE day <= (SELECT d FROM head)
    )
    SELECT COUNT(*)::int AS streak
    FROM runs
    WHERE anchor = (SELECT MAX(anchor) FROM runs WHERE day = (SELECT d FROM head))
  `);
  const raw = result as unknown;
  const rows: Array<{ streak: number }> = Array.isArray(raw)
    ? (raw as Array<{ streak: number }>)
    : Array.isArray((raw as { rows?: Array<{ streak: number }> })?.rows)
      ? ((raw as { rows: Array<{ streak: number }> }).rows)
      : [];
  return Number(rows[0]?.streak ?? 0);
}
