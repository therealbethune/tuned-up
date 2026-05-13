import { db, ratings, songs, users, blocks } from "@/db";
import { sql, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Compute how closely two users agree on the songs they've both rated.
// Returns null if they have fewer than `minShared` songs in common.
async function computeTasteAgreement(
  viewerId: string,
  targetId: string,
  minShared = 3,
): Promise<{ shared: number; agreement: number } | null> {
  if (viewerId === targetId) return null;

  const r1 = alias(ratings, "r1");
  const r2 = alias(ratings, "r2");

  const [row] = await db
    .select({
      shared: sql<number>`count(*)::int`,
      agreement: sql<number>`coalesce(round(avg(100 - abs(${r1.score} - ${r2.score})))::int, 0)`,
    })
    .from(r1)
    .innerJoin(r2, sql`${r2.songId} = ${r1.songId}`)
    .where(sql`${r1.userId} = ${viewerId} AND ${r2.userId} = ${targetId}`);

  if (!row || row.shared < minShared) return null;
  return { shared: Number(row.shared), agreement: Number(row.agreement) };
}

export type TasteComparisonRow = {
  songId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  viewerScore: number;
  targetScore: number;
  delta: number; // signed: viewerScore - targetScore
};

// Detailed breakdown of shared ratings: the songs where they agree most
// (smallest |delta|, ties broken by higher avg score so favorites win)
// and where they disagree most (largest |delta|, ties by recency).
// Returns null if too few shared songs — same threshold as the
// aggregate to keep the UI consistent.
export async function computeTasteDetails(
  viewerId: string,
  targetId: string,
  minShared = 3,
  perBucket = 3,
): Promise<{
  shared: number;
  agreement: number;
  agree: TasteComparisonRow[];
  disagree: TasteComparisonRow[];
} | null> {
  const agg = await computeTasteAgreement(viewerId, targetId, minShared);
  if (!agg) return null;

  const r1 = alias(ratings, "r1");
  const r2 = alias(ratings, "r2");

  // Pull every shared rating (with song metadata) in one query, then
  // sort in JS. Cheap because both users probably have <1000 ratings.
  const rows = await db
    .select({
      songId: r1.songId,
      viewerScore: r1.score,
      targetScore: r2.score,
      title: songs.title,
      artist: songs.artist,
      thumbnail: songs.thumbnail,
    })
    .from(r1)
    .innerJoin(r2, sql`${r2.songId} = ${r1.songId}`)
    .innerJoin(songs, eq(songs.id, r1.songId))
    .where(sql`${r1.userId} = ${viewerId} AND ${r2.userId} = ${targetId}`);

  const enriched: TasteComparisonRow[] = rows.map((r) => ({
    songId: r.songId,
    title: r.title,
    artist: r.artist,
    thumbnail: r.thumbnail,
    viewerScore: r.viewerScore,
    targetScore: r.targetScore,
    delta: r.viewerScore - r.targetScore,
  }));

  // Tightest agreement first; for ties, prefer high scores (a 90/90 is
  // more interesting than a 30/30 — actual shared love).
  const agree = [...enriched]
    .sort(
      (a, b) =>
        Math.abs(a.delta) - Math.abs(b.delta) ||
        b.viewerScore + b.targetScore - (a.viewerScore + a.targetScore),
    )
    .slice(0, perBucket);

  // Loudest disagreement first.
  const disagree = [...enriched]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, perBucket);

  return {
    shared: agg.shared,
    agreement: agg.agreement,
    agree,
    disagree,
  };
}


// Top N users who agree most with the viewer's taste. "Taste twins"
// surface on /me as a follow-suggestion alternative — instead of who
// rates the most, we surface who *thinks like you*. Each row needs
// at least `minShared` ratings in common to qualify so a single
// matching score doesn't crown someone as a soulmate.
export type TasteTwin = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  shared: number;
  agreement: number;
};

export async function findTasteTwins(
  viewerId: string,
  limit = 3,
  minShared = 5,
): Promise<TasteTwin[]> {
  type Row = {
    id: string;
    username: string;
    display_name: string | null;
    image_url: string | null;
    shared: number;
    agreement: number;
  };

  // Cross-join the viewer's ratings against other users' ratings on
  // the same song, then aggregate the diff. Filter out: viewer self,
  // private users (their content opt-out implies "don't surface me as
  // a recommendation"), and anyone in a block edge with the viewer.
  const result = await db.execute(sql`
    WITH viewer_ratings AS (
      SELECT song_id, score FROM ratings WHERE user_id = ${viewerId}
    ),
    overlap AS (
      SELECT
        r.user_id,
        COUNT(*)::int AS shared,
        ROUND(AVG(100 - ABS(vr.score - r.score)))::int AS agreement
      FROM ratings r
      INNER JOIN viewer_ratings vr ON vr.song_id = r.song_id
      WHERE r.user_id <> ${viewerId}
        AND r.user_id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = ${viewerId}
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = ${viewerId}
        )
      GROUP BY r.user_id
      HAVING COUNT(*) >= ${minShared}
    )
    SELECT
      u.id, u.username, u.display_name, u.image_url,
      o.shared, o.agreement
    FROM overlap o
    INNER JOIN users u ON u.id = o.user_id
    WHERE u.is_private = false
    ORDER BY o.agreement DESC, o.shared DESC
    LIMIT ${limit}
  `);

  const raw = result as unknown;
  const rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
      ? ((raw as { rows: Row[] }).rows)
      : [];

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    imageUrl: r.image_url,
    shared: Number(r.shared) || 0,
    agreement: Number(r.agreement) || 0,
  }));
}

// silence unused-import in case neither helper above is called.
void users;
void blocks;
