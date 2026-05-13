import { desc, eq, gte, notInArray, sql } from "drizzle-orm";
import { db, ratings, songs } from "@/db";
import { safeQuery } from "@/lib/safe-query";

// One song per UTC day, shown on /feed top so signed-in users have a
// concrete prompt to keep their streak going. The pick is deterministic
// by date — same song for every user on a given day — but personalized
// to skip songs the viewer has already rated.
//
// Picker logic:
//   1. Pull the top-40 most-rated songs in the last 60 days
//   2. Pick the (date_index % 40)th by stable order so it rotates daily
//   3. If the viewer has already rated it, walk forward until we find
//      one they haven't (within the 40-song pool)

export type DailyPick = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  kind: "song" | "album";
  avgScore: number;
  ratingCount: number;
  alreadyRated: boolean;
};

function utcDayIndex(d: Date = new Date()): number {
  // Days since 1970-01-01 UTC. Stable across timezones — the pick
  // changes at 00:00 UTC, not at the viewer's midnight.
  return Math.floor(d.getTime() / 86_400_000);
}

export async function getDailyPick(viewerId: string | null): Promise<DailyPick | null> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);

  type Row = {
    songId: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    durationSeconds: number | null;
    kind: string;
    avg: number;
    n: number;
  };

  const pool = await safeQuery<Row[]>(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          durationSeconds: songs.durationSeconds,
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
    [] as Row[],
    "daily-pick-pool",
  );
  if (pool.length === 0) return null;

  // The viewer's already-rated set, so the picker can skip past songs
  // they've already scored without wasting their daily attention.
  let alreadyRated = new Set<string>();
  if (viewerId) {
    const songIds = pool.map((p) => p.songId);
    const rated = await safeQuery(
      () =>
        db
          .select({ songId: ratings.songId })
          .from(ratings)
          .where(eq(ratings.userId, viewerId)),
      [] as { songId: string }[],
      "daily-pick-rated",
    );
    alreadyRated = new Set(
      rated.map((r) => r.songId).filter((id) => songIds.includes(id)),
    );
  }

  const baseIdx = utcDayIndex() % pool.length;
  // Walk forward to skip already-rated. Fall through to the picked
  // song even if rated (so the page still shows something with the
  // "alreadyRated" badge instead of going empty).
  for (let i = 0; i < pool.length; i++) {
    const p = pool[(baseIdx + i) % pool.length];
    if (!alreadyRated.has(p.songId)) {
      return {
        songId: p.songId,
        title: p.title,
        artist: p.artist,
        album: p.album,
        thumbnail: p.thumbnail,
        durationSeconds: p.durationSeconds,
        kind: (p.kind === "album" ? "album" : "song"),
        avgScore: Number(p.avg) || 0,
        ratingCount: Number(p.n) || 0,
        alreadyRated: false,
      };
    }
  }
  // Every pool song is rated — show today's slot anyway so the rail
  // still has content + the alreadyRated badge.
  const fallback = pool[baseIdx];
  return {
    songId: fallback.songId,
    title: fallback.title,
    artist: fallback.artist,
    album: fallback.album,
    thumbnail: fallback.thumbnail,
    durationSeconds: fallback.durationSeconds,
    kind: (fallback.kind === "album" ? "album" : "song"),
    avgScore: Number(fallback.avg) || 0,
    ratingCount: Number(fallback.n) || 0,
    alreadyRated: true,
  };
}

// Eject the "checked off today's pick?" flag for the streak nudge.
// Returns true if the viewer has rated today's pick at any point.
// Cheap helper for /feed to swap the card UI to "✓ Picked it" state.
export async function viewerCompletedTodaysPick(
  viewerId: string,
  todaysSongId: string,
): Promise<boolean> {
  const [row] = await safeQuery(
    () =>
      db
        .select({ id: ratings.songId })
        .from(ratings)
        .where(
          // userId + songId is the PK so this is a 1-row index lookup.
          // No extra index needed.
          sql`${ratings.userId} = ${viewerId} AND ${ratings.songId} = ${todaysSongId}`,
        )
        .limit(1),
    [] as { id: string }[],
    "viewer-completed-todays-pick",
  );
  return Boolean(row);
}

// Avoid the unused-import warning when none of these utilities is used
// in a particular caller path.
void desc;
void notInArray;
