import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { computeStreak } from "@/lib/streak";
import {
  highestMilestoneFor,
  maybeAnnounceStreakMilestone,
} from "@/lib/streak-milestones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot backfill so users who already had a long streak before the
// milestone feature shipped get a celebration push (and feed activity)
// for the highest milestone they currently qualify for.
//
// Auth: same INIT_DB_TOKEN we use for migrations.
//
// Strategy:
//   1. Walk every user.
//   2. Compute their actual streak via computeStreak.
//   3. Update users.current_streak.
//   4. If they don't have highest_streak_milestone set yet AND their streak
//      hits one — announce the highest milestone (push + activity rows).
//   5. Idempotent on re-run: highest_streak_milestone is bumped after each
//      announcement, so we only fire once per user per tier.
//
// `?dry=1` returns what WOULD change without writing. `?announce=0` updates
// the cache columns but skips push/activity insertion (useful if you want to
// seed the cache without spamming everyone).
export async function POST(req: Request) {
  const expected = process.env.INIT_DB_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "INIT_DB_TOKEN not set" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const announce = url.searchParams.get("announce") !== "0";

  const all = await db
    .select({
      id: users.id,
      currentStreak: users.currentStreak,
      highest: users.highestStreakMilestone,
    })
    .from(users);

  let scanned = 0;
  let updated = 0;
  let announced = 0;
  const errors: string[] = [];

  for (const u of all) {
    scanned++;
    try {
      const streak = await computeStreak(u.id);
      if (streak !== (u.currentStreak ?? 0)) {
        if (!dry) {
          await db
            .update(users)
            .set({ currentStreak: streak })
            .where(eq(users.id, u.id));
        }
        updated++;
      }
      const targetMilestone = highestMilestoneFor(streak);
      if (announce && targetMilestone > (u.highest ?? 0) && !dry) {
        // Reuse the regular announce path so push + activity rows are wired
        // identically to the live flow.
        const result = await maybeAnnounceStreakMilestone(
          u.id,
          streak,
          u.highest ?? 0,
        );
        if (result.announced) announced++;
      }
    } catch (e) {
      errors.push(`${u.id}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    updated,
    announced,
    dry,
    errors,
  });
}
