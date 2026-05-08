import { NextResponse } from "next/server";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db, users, ratings } from "@/db";
import { computeStreak } from "@/lib/streak";
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
    })
    .from(users)
    .where(and(isNotNull(users.timezone), isNotNull(users.onboardedAt)));

  let evaluated = 0;
  let warned = 0;
  const errors: string[] = [];

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

    // Only warn during the 21:00–21:59 hour in their local time.
    if (localHour !== 21) continue;

    // Already warned today.
    if (u.lastStreakWarnDate === todayStr) continue;

    // Have they rated at all today (in their tz)?
    const [existing] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ratings)
      .where(and(eq(ratings.userId, u.id), gte(ratings.createdAt, dayStartUTC)));
    const ratedToday = (existing?.count ?? 0) > 0;
    if (ratedToday) continue;

    // Compute streak — skip if they don't have one to lose.
    const streak = await computeStreak(u.id);
    if (streak < 1) continue;

    try {
      await sendPushToUser(u.id, {
        title: `🔥 Your ${streak}-day streak is at risk`,
        body: "Rate a song before midnight to keep it going.",
        url: "/search",
        tag: `streak-warning:${u.id}:${todayStr}`,
      });
      await db
        .update(users)
        .set({ lastStreakWarnDate: todayStr })
        .where(eq(users.id, u.id));
      warned++;
    } catch (e) {
      errors.push(`${u.id}: push failed — ${(e as Error).message}`);
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
