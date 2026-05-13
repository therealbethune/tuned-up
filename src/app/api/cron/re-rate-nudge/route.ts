import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sendPushToUser } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly cron: gentle re-engagement push to dormant users with a
// high-rated favorite from > 180 days ago. The idea isn't "rate this
// again" so much as "remember how much you loved this? come back and
// see what's new". Push body cites the actual song so it feels
// personal, not formulaic.
//
// Eligibility:
//   - last rating > 14 days ago (dormant) AND
//   - at least one rating ≥ 85 from > 180 days ago AND
//   - hasn't received this nudge in the last 30 days
//
// Stamps `last_streak_warn_date` is dedicated to the streak warn
// path, so we reuse the activities table as a write-once dedupe lock:
// type='re_rate_nudge' is the marker that this user got the nudge
// recently (within the 30-day lookback we filter on).
//
// Cron-token auth, same pattern as /api/cron/streak-warnings.
export async function POST(req: Request) {
  const expected = process.env.CRON_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "CRON_TOKEN not set" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  type Row = {
    user_id: string;
    song_id: string;
    title: string;
    artist: string;
    score: number;
    rated_at: Date;
  };

  // Pick one favorite per dormant user. ORDER BY ratings.score DESC,
  // ratings.created_at ASC so we surface their EARLIEST big love (the
  // one most likely to have nostalgia weight).
  const result = await db.execute(sql`
    WITH dormant AS (
      SELECT u.id AS user_id
      FROM users u
      LEFT JOIN ratings r ON r.user_id = u.id
      WHERE u.onboarded_at IS NOT NULL
      GROUP BY u.id
      HAVING COALESCE(MAX(r.created_at), '-infinity') < NOW() - INTERVAL '14 days'
    ),
    candidates AS (
      SELECT DISTINCT ON (r.user_id)
        r.user_id,
        r.song_id,
        s.title,
        s.artist,
        r.score,
        r.created_at AS rated_at
      FROM ratings r
      INNER JOIN songs s ON s.id = r.song_id
      WHERE r.user_id IN (SELECT user_id FROM dormant)
        AND r.score >= 85
        AND r.created_at < NOW() - INTERVAL '180 days'
        AND NOT EXISTS (
          SELECT 1 FROM activities a
          WHERE a.user_id = r.user_id
            AND a.type = 're_rate_nudge'
            AND a.created_at > NOW() - INTERVAL '30 days'
        )
      ORDER BY r.user_id, r.score DESC, r.created_at ASC
    )
    SELECT * FROM candidates LIMIT 200
  `);

  const raw = result as unknown;
  const rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
      ? ((raw as { rows: Row[] }).rows)
      : [];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, nudged: 0 });
  }

  // Stamp the activity row + send the push in parallel. The activity
  // row also gives the user a visible "remember this?" entry in their
  // bell next time they open the app.
  await Promise.allSettled(
    rows.map(async (r) => {
      try {
        await db.execute(sql`
          INSERT INTO activities (id, user_id, actor_id, type, song_id, rating_user_id)
          VALUES (gen_random_uuid()::text, ${r.user_id}, ${r.user_id}, 're_rate_nudge', ${r.song_id}, ${r.user_id})
        `);
      } catch {
        /* if FK fails (e.g. song row was removed), skip the row */
      }
      try {
        await sendPushToUser(r.user_id, {
          title: `Remember when you rated ${r.title}?`,
          body: `You gave it a ${r.score}. Tap to see what's new.`,
          url: "/feed",
          tag: `re-rate:${r.user_id}:${r.song_id}`,
          category: "rec",
        });
      } catch {
        /* ignore push failure */
      }
    }),
  );

  return NextResponse.json({ ok: true, nudged: rows.length });
}
