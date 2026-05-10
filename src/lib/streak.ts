import { db, ratings, users } from "@/db";
import { eq } from "drizzle-orm";
import { dateStringInTimezone } from "@/lib/timezone";

// Return the user's current consecutive-day rating streak.
// A streak counts back from today (or from yesterday if they haven't rated
// today yet — so users don't see their streak drop just because it's morning).
// Returns 0 if their last rating was 2+ days ago.
//
// Timezone-aware: uses the user's stored IANA tz so a PST user's 11pm
// rating is "today", not tomorrow per UTC. Falls back to UTC if no tz set.
//
// Implementation: we do the timezone conversion in JavaScript (via
// Intl.DateTimeFormat) instead of SQL. Earlier versions used `AT TIME ZONE`
// or `timezone()` in SQL with the tz value as a bound parameter — both
// silently broke under Drizzle's neon-http driver (parameter type
// inference issue with the AT TIME ZONE operator) and returned 0 for
// every user. Fetching raw timestamps is fine: an active user has at most
// ~one rating per song per day; even at 5k ratings that's ~40KB of
// timestamps. Way under serverless budgets.
export async function computeStreak(userId: string): Promise<number> {
  const [u] = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const tz = u?.tz || "UTC";

  const rows = await db
    .select({ createdAt: ratings.createdAt })
    .from(ratings)
    .where(eq(ratings.userId, userId));

  if (rows.length === 0) return 0;

  // Bucket into a Set of "YYYY-MM-DD in user's tz" strings.
  const days = new Set<string>();
  for (const r of rows) {
    try {
      days.add(dateStringInTimezone(r.createdAt as Date, tz));
    } catch {
      // Bad / unknown tz — skip just this row rather than failing the whole
      // compute. The /api/account/timezone route now validates against
      // Intl.DateTimeFormat so this branch is unreachable for new writes.
    }
  }

  const now = new Date();
  let todayStr: string;
  try {
    todayStr = dateStringInTimezone(now, tz);
  } catch {
    todayStr = dateStringInTimezone(now, "UTC");
  }

  // Cursor is just a tz-agnostic date-counter. We compare via the
  // YYYY-MM-DD string format; the Date itself only serves as the step.
  const [yy, mm, dd] = todayStr.split("-").map(Number);
  let cursor = new Date(Date.UTC(yy, mm - 1, dd));
  const cursorStr = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  // Allow "today" OR "yesterday" as the head of the streak so users
  // viewing in the morning before they've rated don't see it read 0.
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
