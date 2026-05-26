import { cache } from "react";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export type FriendRec = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  appleMusicUrl: string | null;
  spotifyTrackId: string | null;
  durationSeconds: number | null;
  // iTunes preview cache so FriendRecsRail can pass it straight to
  // AudioPreviewButton — no fetch on click, iOS gesture preserved.
  previewUrl: string | null;
  previewChecked: boolean;
  friendCount: number;
  friendAvg: number;
  // Up to 3 friends who rated it, for an avatar stack. Sorted by score
  // desc so the highest-rater leads.
  topRaters: { userId: string; username: string; displayName: string | null; imageUrl: string | null; score: number }[];
};

// "Friends loved this" recommendations: songs the viewer hasn't rated
// where at least `minFriends` people they follow have rated, with a
// friend-average ≥ `minAvg`. Sorted by friend_count desc then friend
// avg desc — popularity within your network beats one friend's hot take.
//
// Empty list when the viewer follows no one, follows no one who rated
// anything ≥ threshold, or has already rated everything their friends
// rated. The caller hides the section silently in those cases.
//
// Wrapped in React's `cache()` so /feed and /discover (both of which
// render the rail) share one DB roundtrip per request — biggest single
// query in the app, easily worth the dedup.
export const recommendedFromFriends = cache(_recommendedFromFriends);

async function _recommendedFromFriends(
  viewerId: string,
  limit = 8,
  minAvg = 80,
  minFriends = 1,
): Promise<FriendRec[]> {
  type Row = {
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    apple_music_url: string | null;
    spotify_track_id: string | null;
    duration_seconds: number | null;
    preview_url: string | null;
    preview_checked: boolean;
    friend_count: number;
    friend_avg: number;
    top_raters_json: string;
  };

  // top_raters aggregates the (up to 3) highest-scoring friend ratings
  // as JSON inside the same query — saves a follow-up roundtrip for
  // each row. We use jsonb_agg + a per-song window function so we can
  // limit to 3 per song.
  const result = await db.execute(sql`
    WITH my_follows AS (
      SELECT followee_id AS id
      FROM follows
      WHERE follower_id = ${viewerId} AND status = 'accepted'
    ),
    my_rated AS (
      SELECT song_id FROM ratings WHERE user_id = ${viewerId}
    ),
    friend_ratings AS (
      SELECT r.song_id, r.user_id, r.score,
             u.username, u.display_name, u.image_url,
             ROW_NUMBER() OVER (
               PARTITION BY r.song_id ORDER BY r.score DESC, r.created_at DESC
             ) AS rn
      FROM ratings r
      JOIN users u ON u.id = r.user_id
      WHERE r.user_id IN (SELECT id FROM my_follows)
        AND r.song_id NOT IN (SELECT song_id FROM my_rated)
    ),
    friend_stats AS (
      SELECT
        song_id,
        COUNT(DISTINCT user_id)::int AS friend_count,
        ROUND(AVG(score))::int AS friend_avg
      FROM friend_ratings
      GROUP BY song_id
    ),
    top_three AS (
      SELECT song_id, jsonb_agg(
        jsonb_build_object(
          'userId', user_id,
          'username', username,
          'displayName', display_name,
          'imageUrl', image_url,
          'score', score
        ) ORDER BY score DESC
      ) FILTER (WHERE rn <= 3) AS raters
      FROM friend_ratings
      GROUP BY song_id
    )
    SELECT
      s.id AS song_id, s.title, s.artist, s.album, s.thumbnail,
      s.apple_music_url, s.spotify_track_id, s.duration_seconds,
      s.preview_url, s.preview_checked,
      fs.friend_count, fs.friend_avg,
      t.raters::text AS top_raters_json
    FROM friend_stats fs
    JOIN songs s ON s.id = fs.song_id
    JOIN top_three t ON t.song_id = fs.song_id
    WHERE fs.friend_count >= ${minFriends}
      AND fs.friend_avg >= ${minAvg}
    ORDER BY fs.friend_count DESC, fs.friend_avg DESC
    LIMIT ${limit}
  `);

  const raw = result as unknown;
  const rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
      ? ((raw as { rows: Row[] }).rows)
      : [];

  return rows.map((r) => {
    let topRaters: FriendRec["topRaters"] = [];
    try {
      const parsed = JSON.parse(r.top_raters_json ?? "[]");
      if (Array.isArray(parsed)) topRaters = parsed;
    } catch {
      /* fallthrough — empty stack is fine */
    }
    return {
      songId: r.song_id,
      title: r.title,
      artist: r.artist,
      album: r.album,
      thumbnail: r.thumbnail,
      appleMusicUrl: r.apple_music_url,
      spotifyTrackId: r.spotify_track_id,
      durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
      previewUrl: r.preview_url,
      previewChecked: r.preview_checked,
      friendCount: Number(r.friend_count),
      friendAvg: Number(r.friend_avg),
      topRaters,
    };
  });
}
