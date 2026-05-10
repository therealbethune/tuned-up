import { db, ratings } from "@/db";
import { sql } from "drizzle-orm";
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
