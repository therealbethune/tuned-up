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

  // Batch: fetch "did each candidate rate since the earliest dayStartUTC"
  // in one query. We over-include users whose dayStart is later, then
  // filter per-user with the correct cutoff in JS. Cheap.
  const earliestDayStart = candidates.reduce(
    (acc, c) => (c.dayStartUTC < acc ? c.dayStartUTC : acc),
    candidates[0].dayStartUTC,
  );
  const recentRatings = await db
    .select({
      userId: ratings.userId,
      createdAt: ratings.createdAt,
    })
    .from(ratings)
    .where(
      and(
        inArray(ratings.userId, candidates.map((c) => c.id)),
        gte(ratings.createdAt, earliestDayStart),
      ),
    );
  const ratedTodayBy = new Set<string>();
  for (const r of recentRatings) {
    const c = candidates.find((x) => x.id === r.userId);
    if (c && r.createdAt >= c.dayStartUTC) ratedTodayBy.add(r.userId);
  }

  for (const c of candidates) {
    if (ratedTodayBy.has(c.id)) continue;
    // Skip if cached streak is already 0 — nothing to lose.
    if (c.cachedStreak < 1) continue;

    try {
      const isUrgent = c.stage === "urgent";
      await sendPushToUser(c.id, {
        title: isUrgent
          ? `⏰ 1 hour left — save your ${c.cachedStreak}-day streak`
          : `🔥 Your ${c.cachedStreak}-day streak is at risk`,
        body: isUrgent
          ? "Rate one song before midnight or it resets to 0."
          : "Rate a song before midnight to keep it going.",
        url: "/search",
        tag: `streak-warning:${c.id}:${c.todayStr}:${c.stage}`,
      });
      // Stamp the highest stage we've sent today. "primary" → todayStr;
      // "urgent" → `${todayStr}:urgent` so the dedup check above sees it.
      const stamp = isUrgent ? `${c.todayStr}:urgent` : c.todayStr;
      await db
        .update(users)
        .set({ lastStreakWarnDate: stamp })
        .where(eq(users.id, c.id));
      warned++;
    } catch (e) {
      errors.push(`${c.id}: push failed — ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    evaluated,
    warned,
    errors,
    at: now.toISOString(),
  });
}
