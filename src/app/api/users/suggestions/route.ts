import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SuggestedFriend = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
  mutualFollowers: number;
  mutualSampleNames: string[];
  reason: string;
};

// Returns up to `limit` suggestions, ranked highest-signal first.
// Composite score: mutuals * 100 + ratingsCount.
//
// Excludes:
//   - the viewer themselves
//   - users the viewer already follows (any status, incl. pending)
//   - users the viewer has explicitly dismissed
//   - users with zero ratings (they have nothing to show)
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  type Row = {
    id: string;
    username: string;
    display_name: string | null;
    image_url: string | null;
    ratings_count: number;
    mutual_followers: number;
    mutual_sample: string[] | null;
  };

  const result = await db.execute(
    sql`
      WITH my_follows AS (
        SELECT followee_id AS id
        FROM follows
        WHERE follower_id = ${userId} AND status = 'accepted'
      ),
      candidates AS (
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.image_url,
          (SELECT COUNT(*)::int FROM ratings r WHERE r.user_id = u.id) AS ratings_count,
          COALESCE(
            (
              SELECT COUNT(DISTINCT f.follower_id)::int
              FROM follows f
              WHERE f.followee_id = u.id
                AND f.status = 'accepted'
                AND f.follower_id IN (SELECT id FROM my_follows)
            ),
            0
          ) AS mutual_followers,
          (
            SELECT array_agg(mn.name)
            FROM (
              SELECT COALESCE(mu.display_name, mu.username) AS name
              FROM follows f2
              JOIN users mu ON mu.id = f2.follower_id
              WHERE f2.followee_id = u.id
                AND f2.status = 'accepted'
                AND f2.follower_id IN (SELECT id FROM my_follows)
              LIMIT 2
            ) mn
          ) AS mutual_sample
        FROM users u
        WHERE u.id <> ${userId}
          -- Exclude private users from suggestions so we don't leak
          -- their existence + rating count to strangers. They can
          -- still be found by direct username search of self.
          AND u.is_private = false
          AND u.id NOT IN (SELECT id FROM my_follows)
          AND NOT EXISTS (
            SELECT 1 FROM follows
            WHERE follower_id = ${userId} AND followee_id = u.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM dismissed_suggestions
            WHERE viewer_id = ${userId} AND suggested_id = u.id
          )
          -- Block-aware: hide anyone the viewer has blocked, or who
          -- blocked the viewer. Required by App Store 1.2 — a blocked
          -- user should never resurface as a friend suggestion.
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
            WHERE (b.blocker_id = ${userId} AND b.blocked_id = u.id)
               OR (b.blocker_id = u.id AND b.blocked_id = ${userId})
          )
      )
      SELECT *
      FROM candidates
      WHERE ratings_count > 0
      ORDER BY mutual_followers DESC, ratings_count DESC
      LIMIT ${limit}
    `,
  );

  // drizzle's neon-http db.execute returns either an array of row objects
  // directly or a { rows: [...] } shape depending on version — handle both.
  const raw = result as unknown;
  const rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
    ? ((raw as { rows: Row[] }).rows)
    : [];

  const suggestions: SuggestedFriend[] = rows.map((r) => {
    const mutualNames = r.mutual_sample ?? [];
    let reason: string;
    if (r.mutual_followers > 0) {
      const display = mutualNames.slice(0, 2).join(" & ") || "people you follow";
      const more =
        r.mutual_followers > mutualNames.length
          ? ` and ${r.mutual_followers - mutualNames.length} others`
          : "";
      reason = `Followed by ${display}${more}`;
    } else {
      const n = Number(r.ratings_count);
      reason = `${n} ${n === 1 ? "rating" : "ratings"}`;
    }
    return {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      imageUrl: r.image_url,
      ratingsCount: Number(r.ratings_count),
      mutualFollowers: Number(r.mutual_followers),
      mutualSampleNames: mutualNames,
      reason,
    };
  });

  return NextResponse.json({ suggestions });
}
