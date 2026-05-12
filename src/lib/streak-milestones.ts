// Milestone tier system for streaks. When a user's streak crosses one of
// these thresholds for the first time, we drop a `streak_milestone` activity
// addressed to each of their followers + push the user a celebratory note.

import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, users, follows, activities } from "@/db";
import { sendPushToUser } from "@/lib/push";

export const MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365, 500, 1000] as const;

export type Milestone = (typeof MILESTONES)[number];

export function highestMilestoneFor(streak: number): number {
  let hit = 0;
  for (const m of MILESTONES) {
    if (streak >= m) hit = m;
  }
  return hit;
}

// What percentile of users have a streak strictly less than the given value?
// Returns a number 0..100 (rounded). Considers only users with streak > 0.
//
// Drizzle's neon-http `db.execute` returns either an Array directly or
// `{ rows: [...] }` depending on driver version — handle both shapes so this
// works on the deployed Netlify functions runtime.
export async function streakPercentile(streak: number): Promise<number> {
  if (streak <= 0) return 0;
  const result = await db.execute(sql`
    WITH active AS (
      SELECT current_streak FROM users WHERE current_streak > 0
    )
    SELECT COALESCE(
      ROUND(
        100.0 * (SELECT COUNT(*) FROM active WHERE current_streak < ${streak})::numeric /
        NULLIF((SELECT COUNT(*) FROM active), 0),
        0
      ),
      0
    )::int AS pct
  `);
  const raw = result as unknown;
  const rows: Array<{ pct: number }> = Array.isArray(raw)
    ? (raw as Array<{ pct: number }>)
    : Array.isArray((raw as { rows?: Array<{ pct: number }> })?.rows)
      ? ((raw as { rows: Array<{ pct: number }> }).rows)
      : [];
  return Number(rows[0]?.pct ?? 0);
}

// Update the cached streak on the users row. Called once per rating insert.
// Returns the prior + new streak so the caller can detect milestone crossings.
export async function refreshUserStreak(
  userId: string,
  computedStreak: number,
): Promise<{ before: number; after: number; previousMilestone: number }> {
  const [prev] = await db
    .select({
      currentStreak: users.currentStreak,
      highest: users.highestStreakMilestone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({ currentStreak: computedStreak })
    .where(eq(users.id, userId));

  return {
    before: prev?.currentStreak ?? 0,
    after: computedStreak,
    previousMilestone: prev?.highest ?? 0,
  };
}

// Fire a milestone celebration if the new streak crosses a new threshold.
// Idempotent via users.highest_streak_milestone — same milestone won't repeat.
export async function maybeAnnounceStreakMilestone(
  userId: string,
  newStreak: number,
  previousMilestone: number,
): Promise<{ announced: boolean; milestone: number; percentile: number }> {
  const newMilestone = highestMilestoneFor(newStreak);
  if (newMilestone <= previousMilestone) {
    return { announced: false, milestone: newMilestone, percentile: 0 };
  }

  const pct = await streakPercentile(newStreak);

  // Top X% — if pct = 90 (90% of active streakers are below), they're top 10%.
  const topPct = Math.max(1, 100 - pct);

  // Persist that we've announced this milestone so we don't loop.
  await db
    .update(users)
    .set({ highestStreakMilestone: newMilestone })
    .where(eq(users.id, userId));

  // Send the celebrating user a push.
  try {
    await sendPushToUser(userId, {
      title: `🔥 ${newMilestone}-day streak!`,
      body: `You're in the top ${topPct}% of streak holders. Don't break it now.`,
      url: "/me",
      tag: `streak_milestone:${userId}:${newMilestone}`,
    });
  } catch {
    /* ignore push failures */
  }

  // Drop a feed/activity row for each follower so it shows up in their feed.
  try {
    const followers = await db
      .select({ followerId: follows.followerId })
      .from(follows)
      .where(
        and(eq(follows.followeeId, userId), eq(follows.status, "accepted")),
      );

    if (followers.length > 0) {
      await db.insert(activities).values(
        followers.map((f) => ({
          id: randomUUID(),
          userId: f.followerId,
          actorId: userId,
          type: "streak_milestone",
          // Encode the milestone + percentile in songId field (re-using
          // existing column) as `streak:<days>:<topPct>` so renderers can
          // pull it without a schema change.
          songId: `streak:${newMilestone}:${topPct}`,
        })),
      );
    }
  } catch {
    /* ignore */
  }

  return { announced: true, milestone: newMilestone, percentile: topPct };
}

