import { desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { db, ratings, songs } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { MS_PER_DAY } from "@/lib/time-constants";

// One song per UTC day, shown on /feed top so signed-in users have a
// concrete prompt to keep their streak going. The pick is deterministic
// by date — same song for every user on a given day — but personalized
// to skip songs the viewer has already rated.
//
// Picker logic:
//   1. Pull the top-40 most-rated songs in the last 60 days, excluding
//      anything the viewer has already rated. Done in one query via a
//      NOT IN subquery so we don't pay for two roundtrips.
//   2. Pick the (date_index % poolSize)th by stable order so it
//      rotates daily.
//   3. If the pool is empty (every popular song already rated), fall
//      back to the unfiltered pool and surface the "already rated"
//      badge instead of an empty rail.

export type DailyPick = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  previewUrl: string | null;
  previewChecked: boolean;
  kind: "song" | "album";
  avgScore: number;
  ratingCount: number;
  alreadyRated: boolean;
};

function utcDayIndex(d: Date = new Date()): number {
  return Math.floor(d.getTime() / MS_PER_DAY);
}

type PoolRow = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  previewUrl: string | null;
  previewChecked: boolean;
  kind: string;
  avg: number;
  n: number;
};

function toDailyPick(p: PoolRow, alreadyRated: boolean): DailyPick {
  return {
    songId: p.songId,
    title: p.title,
    artist: p.artist,
    album: p.album,
    thumbnail: p.thumbnail,
    durationSeconds: p.durationSeconds,
    previewUrl: p.previewUrl,
    previewChecked: p.previewChecked,
    kind: p.kind === "album" ? "album" : "song",
    avgScore: Number(p.avg) || 0,
    ratingCount: Number(p.n) || 0,
    alreadyRated,
  };
}

export async function getDailyPick(viewerId: string | null): Promise<DailyPick | null> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * MS_PER_DAY);

  // Build the "songs the viewer hasn't rated yet" filter as a NOT IN
  // subquery so we get a single roundtrip. Skipped when the viewer is
  // anonymous (no signed-in user → no rated set to exclude).
  const ratedFilter = viewerId
    ? notInArray(
        songs.id,
        db.select({ s: ratings.songId }).from(ratings).where(eq(ratings.userId, viewerId)),
      )
    : undefined;

  const pool = await safeQuery<PoolRow[]>(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          durationSeconds: songs.durationSeconds,
          previewUrl: songs.previewUrl,
          previewChecked: songs.previewChecked,
          kind: songs.kind,
          avg: sql<number>`round(avg(${ratings.score}))::int`,
          n: sql<number>`count(${ratings.songId})::int`,
        })
        .from(ratings)
        .innerJoin(songs, eq(songs.id, ratings.songId))
        .where(
          ratedFilter
            ? sql`${ratings.createdAt} >= ${sixtyDaysAgo} AND ${ratedFilter}`
            : gte(ratings.createdAt, sixtyDaysAgo),
        )
        .groupBy(songs.id)
        .orderBy(desc(sql`count(${ratings.songId})`), desc(songs.id))
        .limit(40),
    [] as PoolRow[],
    "daily-pick-pool",
  );

  if (pool.length > 0) {
    const idx = utcDayIndex() % pool.length;
    return toDailyPick(pool[idx], false);
  }

  // Pool was empty — every recent popular song is already rated by
  // this viewer. Fall back to the unfiltered top-40 so the rail
  // still has a card (badged "Picked it").
  if (!viewerId) return null;
  const fallbackPool = await safeQuery<PoolRow[]>(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          durationSeconds: songs.durationSeconds,
          previewUrl: songs.previewUrl,
          previewChecked: songs.previewChecked,
          kind: songs.kind,
          avg: sql<number>`round(avg(${ratings.score}))::int`,
          n: sql<number>`count(${ratings.songId})::int`,
        })
        .from(ratings)
        .innerJoin(songs, eq(songs.id, ratings.songId))
        .where(gte(ratings.createdAt, sixtyDaysAgo))
        .groupBy(songs.id)
        .orderBy(desc(sql`count(${ratings.songId})`), desc(songs.id))
        .limit(40),
    [] as PoolRow[],
    "daily-pick-pool-fallback",
  );
  if (fallbackPool.length === 0) return null;
  const idx = utcDayIndex() % fallbackPool.length;
  return toDailyPick(fallbackPool[idx], true);
}
