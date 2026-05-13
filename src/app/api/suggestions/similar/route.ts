import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { memoryRateLimited, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/suggestions/similar?songId=...&score=N
//
// Returns up to 3 song suggestions tuned to the viewer's most recent
// rating. The signal is "people who rated this song in a similar band
// (±15) ALSO rated these other songs highly". That's a cheap form of
// collaborative filtering — strong enough to feel uncanny on a healthy
// catalog without needing an embedding model.
//
// If the similar-raters pool returns fewer than 3, we top up with
// generally-top-rated songs the viewer hasn't rated so the modal
// always shows something. Block-aware: songs from blocked users don't
// influence the suggestion or pollute the result.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = memoryRateLimited(LIMITS.SUGGESTIONS, `similar:${userId}`);
  if (limited) return limited;

  const url = new URL(req.url);
  const songId = url.searchParams.get("songId") ?? "";
  const scoreRaw = Number(url.searchParams.get("score") ?? "");
  if (!songId || !Number.isFinite(scoreRaw) || scoreRaw < 1 || scoreRaw > 100) {
    return NextResponse.json({ error: "bad_params" }, { status: 400 });
  }
  const score = Math.round(scoreRaw);
  const band = 15;

  type Row = {
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    kind: string;
    duration_seconds: number | null;
    n: number;
    avg: number;
  };

  const result = await db.execute(sql`
    WITH similar_raters AS (
      SELECT user_id FROM ratings
      WHERE song_id = ${songId}
        AND user_id <> ${userId}
        AND ABS(score - ${score}) <= ${band}
        -- Pool excludes anyone on either side of a block edge with viewer.
        AND user_id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ${userId}
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ${userId}
        )
    ),
    candidates AS (
      SELECT
        s.id          AS song_id,
        s.title       AS title,
        s.artist      AS artist,
        s.album       AS album,
        s.thumbnail   AS thumbnail,
        s.kind        AS kind,
        s.duration_seconds AS duration_seconds,
        COUNT(*)::int AS n,
        ROUND(AVG(r.score))::int AS avg
      FROM ratings r
      INNER JOIN songs s ON s.id = r.song_id
      WHERE r.user_id IN (SELECT user_id FROM similar_raters)
        AND r.score >= 75
        AND r.song_id <> ${songId}
        AND r.song_id NOT IN (
          SELECT song_id FROM ratings WHERE user_id = ${userId}
        )
      GROUP BY s.id
      ORDER BY n DESC, avg DESC
      LIMIT 3
    )
    SELECT * FROM candidates
  `);

  const raw = result as unknown;
  let rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
      ? ((raw as { rows: Row[] }).rows)
      : [];

  // Top up to 3 with general high-rated unrated songs if the
  // similar-raters pool didn't produce enough.
  if (rows.length < 3) {
    const need = 3 - rows.length;
    const excludeIds = [songId, ...rows.map((r) => r.song_id)];
    const fallback = await db.execute(sql`
      SELECT
        s.id          AS song_id,
        s.title       AS title,
        s.artist      AS artist,
        s.album       AS album,
        s.thumbnail   AS thumbnail,
        s.kind        AS kind,
        s.duration_seconds AS duration_seconds,
        COUNT(*)::int AS n,
        ROUND(AVG(r.score))::int AS avg
      FROM ratings r
      INNER JOIN songs s ON s.id = r.song_id
      WHERE r.song_id <> ALL(${excludeIds})
        AND r.song_id NOT IN (
          SELECT song_id FROM ratings WHERE user_id = ${userId}
        )
      GROUP BY s.id
      HAVING COUNT(*) >= 2
      ORDER BY AVG(r.score) DESC, COUNT(*) DESC
      LIMIT ${need}
    `);
    const fbRaw = fallback as unknown;
    const fbRows: Row[] = Array.isArray(fbRaw)
      ? (fbRaw as Row[])
      : Array.isArray((fbRaw as { rows?: Row[] })?.rows)
        ? ((fbRaw as { rows: Row[] }).rows)
        : [];
    rows = [...rows, ...fbRows];
  }

  const suggestions = rows.map((r) => ({
    id: r.song_id,
    kind: (r.kind === "album" ? "album" : "song") as "song" | "album",
    title: r.title,
    artist: r.artist,
    album: r.album,
    thumbnail: r.thumbnail,
    durationSeconds: r.duration_seconds,
    avg: Number(r.avg) || null,
    n: Number(r.n) || 0,
  }));

  return NextResponse.json({ suggestions });
}
