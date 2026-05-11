import { db, ratings, songs } from "@/db";
import { sql, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

// Compute how closely two users agree on the songs they've both rated.
// Returns null if they have fewer than `minShared` songs in common.
export async function computeTasteAgreement(
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

