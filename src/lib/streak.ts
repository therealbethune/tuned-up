import { db, ratings, users } from "@/db";
import { eq } from "drizzle-orm";
import { dateStringInTimezone } from "@/lib/timezone";

// Return the user's current consecutive-day rating streak.
// A streak counts back from today (or from yesterday if they haven't rated
// today yet — so users don't see their streak drop just because it's morning).
// Returns 0 if their last rating was 2+ days ago (unless freeze tokens are
// available — see `freezesAvailable`).
//
// Streak freeze tokens (Wave BD): if `freezesAvailable > 0` and the user
// has a missed day in the middle of an otherwise-continuous streak, one
// token is consumed per missed day to keep the streak alive. The caller
// gets back the number of freezes actually used so the cached count can
// be decremented.
//
// Timezone-aware: uses the user's stored IANA tz so a PST user's 11pm
// rating is "today", not tomorrow per UTC. Falls back to UTC if no tz set.
export async function computeStreak(
  userId: string,
  freezesAvailable = 0,
): Promise<{ streak: number; freezesUsed: number }> {
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

  if (rows.length === 0) return { streak: 0, freezesUsed: 0 };

  // Bucket into a Set of "YYYY-MM-DD in user's tz" strings.
  const days = new Set<string>();
  for (const r of rows) {
    try {
      days.add(dateStringInTimezone(r.createdAt as Date, tz));
    } catch {
      /* skip invalid tz row */
    }
  }

  const now = new Date();
  let todayStr: string;
  try {
    todayStr = dateStringInTimezone(now, tz);
  } catch {
    todayStr = dateStringInTimezone(now, "UTC");
  }

  const [yy, mm, dd] = todayStr.split("-").map(Number);
  let cursor = new Date(Date.UTC(yy, mm - 1, dd));
  const cursorStr = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  let freezesRemaining = Math.max(0, Math.floor(freezesAvailable));
  let freezesUsed = 0;

  // Find the head of the streak: today, yesterday, or 2-days-ago-with-freeze.
  if (!days.has(cursorStr(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000);
    if (!days.has(cursorStr(cursor))) {
      // Streak has been gone for at least 2 days at the head. A freeze
      // here would have to bridge today + yesterday → 2 gaps in a row,
      // which we don't support (one-day grace only). Return zero so
      // the user gets a clean restart rather than a token-eating
      // bottomless pit.
      return { streak: 0, freezesUsed: 0 };
    }
  }

  let streak = 0;
  while (true) {
    if (days.has(cursorStr(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - 86_400_000);
      continue;
    }
    // Found a gap mid-streak. Consume a freeze if available and walk
    // past the missing day. Only single-day gaps bridge — two missed
    // days in a row breaks the streak even with tokens.
    if (freezesRemaining > 0) {
      const peek = new Date(cursor.getTime() - 86_400_000);
      if (days.has(cursorStr(peek))) {
        freezesRemaining--;
        freezesUsed++;
        // Count the bridged day as part of the streak so the visible
        // length grows by the day the freeze rescued.
        streak++;
        cursor = peek;
        continue;
      }
    }
    break;
  }
  return { streak, freezesUsed };
}
