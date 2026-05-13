import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { memoryRateLimited, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/suggestions/surprise
//
// Returns a single song the viewer hasn't rated yet, picked from
// people-they-follow's 75+ ratings. Falls back to the wider catalog
// if their follow graph is too sparse to produce a candidate.
// Randomized with ORDER BY random() so two taps in a row don't
// return the same row.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = memoryRateLimited(LIMITS.SUGGESTIONS, `surprise:${userId}`);
  if (limited) return limited;

  type Row = {
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    kind: string;
    duration_seconds: number | null;
    avg: number;
    n: number;
  };

  const friendsPool = await db.execute(sql`
    SELECT
      s.id AS song_id,
      s.title, s.artist, s.album, s.thumbnail, s.kind, s.duration_seconds,
      ROUND(AVG(r.score))::int AS avg,
      COUNT(*)::int AS n
    FROM ratings r
    INNER JOIN songs s ON s.id = r.song_id
    WHERE r.score >= 75
      AND r.user_id IN (
        SELECT followee_id FROM follows
        WHERE follower_id = ${userId} AND status = 'accepted'
      )
      AND r.song_id NOT IN (
        SELECT song_id FROM ratings WHERE user_id = ${userId}
      )
      AND r.user_id NOT IN (
        SELECT blocked_id FROM blocks WHERE blocker_id = ${userId}
        UNION
        SELECT blocker_id FROM blocks WHERE blocked_id = ${userId}
      )
    GROUP BY s.id
    ORDER BY random()
    LIMIT 1
  `);

  let raw = friendsPool as unknown;
  let rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
      ? ((raw as { rows: Row[] }).rows)
      : [];

  if (rows.length === 0) {
    // Fallback: any 75+ song that isn't blocked or already rated.
    const wider = await db.execute(sql`
      SELECT
        s.id AS song_id,
        s.title, s.artist, s.album, s.thumbnail, s.kind, s.duration_seconds,
        ROUND(AVG(r.score))::int AS avg,
        COUNT(*)::int AS n
      FROM ratings r
      INNER JOIN songs s ON s.id = r.song_id
      WHERE r.score >= 75
        AND r.song_id NOT IN (
          SELECT song_id FROM ratings WHERE user_id = ${userId}
        )
        AND r.user_id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ${userId}
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ${userId}
        )
      GROUP BY s.id
      HAVING COUNT(*) >= 2
      ORDER BY random()
      LIMIT 1
    `);
    raw = wider;
    rows = Array.isArray(raw)
      ? (raw as Row[])
      : Array.isArray((raw as { rows?: Row[] })?.rows)
        ? ((raw as { rows: Row[] }).rows)
        : [];
  }

  if (rows.length === 0) return NextResponse.json({ song: null });
  const r = rows[0];
  return NextResponse.json({
    song: {
      id: r.song_id,
      kind: (r.kind === "album" ? "album" : "song") as "song" | "album",
      title: r.title,
      artist: r.artist,
      album: r.album,
      thumbnail: r.thumbnail,
      durationSeconds: r.duration_seconds,
      avgScore: Number(r.avg) || 0,
      ratingCount: Number(r.n) || 0,
    },
  });
}
