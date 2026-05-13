import { NextResponse } from "next/server";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { db, users, ratings } from "@/db";
import { sendPushToUser } from "@/lib/push";
import { dateStringInTimezone, hourInTimezone, startOfDayUTC } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hourly cron: warn users they're about to lose their rating streak.
//
// Triggered ~every hour by an external scheduler (e.g. GitHub Actions or
// cron-job.org). For each onboarded user with an IANA timezone set:
//   - if their local hour is 21 (9pm — 3 hours before midnight)
//   - and their current streak ≥ 1
//   - and they haven't rated anything since the start of their local "today"
//   - and we haven't already sent today's warning
// → push them a notification and stamp last_streak_warn_date.
//
// Auth via header `Authorization: Bearer ${CRON_TOKEN}`.
export async function POST(req: Request) {
  const expected = process.env.CRON_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "CRON_TOKEN not set" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Candidate users: have a timezone set + are onboarded.
  const cohort = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      lastStreakWarnDate: users.lastStreakWarnDate,
      currentStreak: users.currentStreak,
    })
    .from(users)
    .where(and(isNotNull(users.timezone), isNotNull(users.onboardedAt)));

  let evaluated = 0;
  let warned = 0;
  const errors: string[] = [];

  // First pass: filter to users whose local clock is currently in the
  // 21:00 hour AND who haven't been warned today. Avoids paying the
  // per-user DB query on the 23/24 fraction of users not in their warning
  // window.
  // Two warning windows per local day:
  //   - 21:00 (primary): gentle nudge, "your N-day streak is at risk"
  //   - 23:00 (urgent):  last-chance, "only an hour left to save your streak"
  // The lastStreakWarnDate field encodes the highest stage we've reached
  // today: bare YYYY-MM-DD means primary sent; YYYY-MM-DD:urgent means
  // urgent also sent. So a user can receive exactly one of each per day,
  // and never if they already rated.
  type Stage = "primary" | "urgent";
  type CandidateUser = {
    id: string;
    timezone: string;
    lastStreakWarnDate: string | null;
    todayStr: string;
    dayStartUTC: Date;
    cachedStreak: number;
    stage: Stage;
  };
  const candidates: CandidateUser[] = [];

  for (const u of cohort) {
    if (!u.timezone) continue;
    evaluated++;
    let localHour: number;
    let todayStr: string;
    let dayStartUTC: Date;
    try {
      localHour = hourInTimezone(now, u.timezone);
      todayStr = dateStringInTimezone(now, u.timezone);
      dayStartUTC = startOfDayUTC(now, u.timezone);
    } catch (e) {
      errors.push(`${u.id}: timezone ${u.timezone} — ${(e as Error).message}`);
      continue;
    }
    let stage: Stage;
    if (localHour === 21) stage = "primary";
    else if (localHour === 23) stage = "urgent";
    else continue;

    // Has this user already received this stage today?
    const alreadyPrimary =
      u.lastStreakWarnDate === todayStr ||
      u.lastStreakWarnDate === `${todayStr}:urgent`;
    const alreadyUrgent = u.lastStreakWarnDate === `${todayStr}:urgent`;
    if (stage === "primary" && alreadyPrimary) continue;
    if (stage === "urgent" && alreadyUrgent) continue;
    candidates.push({
      id: u.id,
      timezone: u.timezone,
      lastStreakWarnDate: u.lastStreakWarnDate,
      todayStr,
      dayStartUTC,
      cachedStreak: u.currentStreak ?? 0,
      stage,
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, evaluated, warned: 0, errors, at: now.toISOString() });
  }

  // Batch: fetch each candidate's recent rating timestamps in one query.
  // We need both:
  //   - "did they rate today" (in their local timezone) → skip warn
  //   - "did they rate yesterday" → validates that the cached streak is
  //     still accurate. If their most recent rating is >48h ago the
  //     streak has already broken even though `currentStreak` won't
  //     reflect it until they rate again (refreshUserStreak only runs on
  //     POST /api/ratings). Sending "your 5-day streak is at risk" to
  //     someone whose streak is actually already 0 is the most annoying
  //     possible notification — guard against it.
  //
  // Query window: earliest candidate's dayStart, then walk back 24h to
  // catch yesterday too.
  const earliestDayStart = candidates.reduce(
    (acc, c) => (c.dayStartUTC < acc ? c.dayStartUTC : acc),
    candidates[0].dayStartUTC,
  );
  const lookbackStart = new Date(earliestDayStart.getTime() - 24 * 60 * 60 * 1000);
  const recentRatings = await db
    .select({
      userId: ratings.userId,
      createdAt: ratings.createdAt,
    })
    .from(ratings)
    .where(
      and(
        inArray(ratings.userId, candidates.map((c) => c.id)),
        gte(ratings.createdAt, lookbackStart),
      ),
    );
  // Build candidate lookup map once (was an O(n²) `.find` inside the
  // recentRatings loop — fine at a few hundred candidates, painful as the
  // user base grows).
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ratedTodayBy = new Set<string>();
  const ratedYesterdayBy = new Set<string>();
  for (const r of recentRatings) {
    const c = byId.get(r.userId);
    if (!c) continue;
    if (r.createdAt >= c.dayStartUTC) {
      ratedTodayBy.add(r.userId);
    } else {
      // Falls in the [lookbackStart, dayStartUTC) window → "yesterday".
      ratedYesterdayBy.add(r.userId);
    }
  }

  // Filter to the cohort that should actually be warned, then fan out
  // pushes + DB stamps in parallel. The previous sequential for-loop
  // burned ~200ms per user × N users (push + DB roundtrip each). At
  // 100 candidates that was 20s of wall-clock cron time; the cron
  // budget is bounded so this scaled the function dangerously close
  // to its timeout. Each user is independent — Promise.allSettled
  // lets us proceed past flaky push providers without aborting the
  // batch.
  const toWarn = candidates.filter(
    (c) =>
      !ratedTodayBy.has(c.id) &&
      c.cachedStreak >= 1 &&
      // Guard against the stale-cache case: if they didn't rate
      // yesterday either, their streak is already broken — don't send
      // a misleading "your streak is at risk" warning.
      ratedYesterdayBy.has(c.id),
  );

  await Promise.allSettled(
    toWarn.map(async (c) => {
      const isUrgent = c.stage === "urgent";
      try {
        await sendPushToUser(c.id, {
          category: "streak",
          title: isUrgent
            ? `⏰ 1 hour left — save your ${c.cachedStreak}-day streak`
            : `🔥 Your ${c.cachedStreak}-day streak is at risk`,
          body: isUrgent
            ? "Rate one song before midnight or it resets to 0."
            : "Rate a song before midnight to keep it going.",
          url: "/search",
          tag: `streak-warning:${c.id}:${c.todayStr}:${c.stage}`,
        });
        // Stamp the highest stage we've sent today. "primary" →
        // todayStr; "urgent" → `${todayStr}:urgent` so the dedup
        // check above sees it.
        const stamp = isUrgent ? `${c.todayStr}:urgent` : c.todayStr;
        await db
          .update(users)
          .set({ lastStreakWarnDate: stamp })
          .where(eq(users.id, c.id));
        warned++;
      } catch (e) {
        errors.push(`${c.id}: push failed — ${(e as Error).message}`);
      }
    }),
  );

  return NextResponse.json({
    ok: true,
    evaluated,
    warned,
    errors,
    at: now.toISOString(),
  });
}
