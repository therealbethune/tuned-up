import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { desc, sql, gte } from "drizzle-orm";
import { db, ratings, songs } from "@/db";
import { isAlbumId, ytUrlForSongId } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";
import { RateButton } from "@/components/RateButton";

export const dynamic = "force-dynamic";

type DiscoverRow = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  appleMusicUrl: string | null;
  ratingCount: number;
  avgScore: number;
};

type RecRow = DiscoverRow & {
  reason: string;
  durationSeconds: number | null;
};

async function trendingThisWeek(): Promise<DiscoverRow[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      thumbnail: songs.thumbnail,
      appleMusicUrl: songs.appleMusicUrl,
      ratingCount: sql<number>`count(${ratings.songId})::int`,
      avgScore: sql<number>`round(avg(${ratings.score}))::int`,
    })
    .from(ratings)
    .innerJoin(songs, sql`${songs.id} = ${ratings.songId}`)
    .where(gte(ratings.createdAt, sevenDaysAgo))
    .groupBy(songs.id)
    .orderBy(desc(sql`count(${ratings.songId})`))
    .limit(15);
  return rows;
}

async function topRated(): Promise<DiscoverRow[]> {
  const rows = await db
    .select({
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      thumbnail: songs.thumbnail,
      appleMusicUrl: songs.appleMusicUrl,
      ratingCount: sql<number>`count(${ratings.songId})::int`,
      avgScore: sql<number>`round(avg(${ratings.score}))::int`,
    })
    .from(ratings)
    .innerJoin(songs, sql`${songs.id} = ${ratings.songId}`)
    .groupBy(songs.id)
    .having(sql`count(${ratings.songId}) >= 2`)
    .orderBy(desc(sql`avg(${ratings.score})`), desc(sql`count(${ratings.songId})`))
    .limit(15);
  return rows;
}

// Personal "Recommended for you" — songs the viewer hasn't rated, ranked by
// signal-strength of what we know about their network. Two-tier:
//   1. Songs rated by people the viewer follows (shown as "X friends · avg")
//   2. Falls back to globally popular highly-rated tracks
//
// The "reason" string is the small subtext under each card.
async function recommendedForViewer(viewerId: string | null): Promise<RecRow[]> {
  type Row = {
    song_id: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    apple_music_url: string | null;
    duration_seconds: number | null;
    rating_count: number;
    avg_score: number;
    friend_count: number;
    friend_avg: number | null;
  };

  const result = await db.execute(
    viewerId
      ? sql`
          WITH my_follows AS (
            SELECT followee_id AS id
            FROM follows
            WHERE follower_id = ${viewerId} AND status = 'accepted'
          ),
          my_rated AS (
            SELECT song_id FROM ratings WHERE user_id = ${viewerId}
          ),
          friend_stats AS (
            SELECT
              r.song_id,
              COUNT(DISTINCT r.user_id)::int AS friend_count,
              ROUND(AVG(r.score))::int AS friend_avg
            FROM ratings r
            WHERE r.user_id IN (SELECT id FROM my_follows)
              AND r.song_id NOT IN (SELECT song_id FROM my_rated)
            GROUP BY r.song_id
          ),
          global_stats AS (
            SELECT
              r.song_id,
              COUNT(*)::int AS rating_count,
              ROUND(AVG(r.score))::int AS avg_score
            FROM ratings r
            WHERE r.song_id NOT IN (SELECT song_id FROM my_rated)
            GROUP BY r.song_id
          )
          SELECT
            s.id AS song_id, s.title, s.artist, s.album, s.thumbnail,
            s.apple_music_url, s.duration_seconds,
            g.rating_count, g.avg_score,
            COALESCE(f.friend_count, 0) AS friend_count,
            f.friend_avg
          FROM songs s
          JOIN global_stats g ON g.song_id = s.id
          LEFT JOIN friend_stats f ON f.song_id = s.id
          ORDER BY
            COALESCE(f.friend_count, 0) DESC,
            COALESCE(f.friend_avg, 0) DESC,
            g.avg_score DESC,
            g.rating_count DESC
          LIMIT 15
        `
      : sql`
          SELECT
            s.id AS song_id, s.title, s.artist, s.album, s.thumbnail,
            s.apple_music_url, s.duration_seconds,
            COUNT(*)::int AS rating_count,
            ROUND(AVG(r.score))::int AS avg_score,
            0 AS friend_count,
            NULL::int AS friend_avg
          FROM ratings r
          JOIN songs s ON s.id = r.song_id
          GROUP BY s.id
          HAVING COUNT(*) >= 2
          ORDER BY ROUND(AVG(r.score)) DESC, COUNT(*) DESC
          LIMIT 15
        `,
  );
  const raw = result as unknown;
  const rows: Row[] = Array.isArray(raw)
    ? (raw as Row[])
    : Array.isArray((raw as { rows?: Row[] })?.rows)
    ? ((raw as { rows: Row[] }).rows)
    : [];

  return rows.map((r) => {
    const friendCount = Number(r.friend_count ?? 0);
    let reason: string;
    if (friendCount > 0) {
      reason = `${friendCount} friend${friendCount === 1 ? "" : "s"} · avg ${r.friend_avg ?? r.avg_score}`;
    } else {
      reason = `${r.rating_count} ${r.rating_count === 1 ? "rating" : "ratings"} · avg ${r.avg_score}`;
    }
    return {
      songId: r.song_id,
      title: r.title,
      artist: r.artist,
      album: r.album,
      thumbnail: r.thumbnail,
      appleMusicUrl: r.apple_music_url,
      ratingCount: Number(r.rating_count),
      avgScore: Number(r.avg_score),
      reason,
      durationSeconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
    };
  });
}

function DiscoverList({ rows }: { rows: DiscoverRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-neutral-500 text-sm">
        Not enough ratings yet. Be the first — head to{" "}
        <Link href="/search" className="underline">Search</Link>.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const url = ytUrlForSongId(r.songId);
        return (
          <li
            key={r.songId}
            className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="relative shrink-0 group"
                title="Open in YouTube Music"
              >
                {r.thumbnail ? (
                  <Image src={r.thumbnail} alt="" width={48} height={48} className="rounded h-12 w-12 object-cover" unoptimized />
                ) : (
                  <div className="h-12 w-12 rounded bg-neutral-800" />
                )}
                <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                  <svg
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </a>
            ) : r.thumbnail ? (
              <Image src={r.thumbnail} alt="" width={48} height={48} className="rounded h-12 w-12 object-cover shrink-0" unoptimized />
            ) : (
              <div className="h-12 w-12 rounded bg-neutral-800 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate block hover:underline">
                  {r.title}
                </a>
              ) : (
                <div className="font-medium truncate">{r.title}</div>
              )}
              <div className="text-sm text-neutral-400 truncate">
                {r.artist}{r.album ? ` · ${r.album}` : ""}
              </div>
              <StreamingLinks songId={r.songId} title={r.title} artist={r.artist} appleMusicUrl={r.appleMusicUrl} className="mt-1" />
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold tabular-nums">{r.avgScore}</div>
              <div className="text-xs text-neutral-500">
                avg · {r.ratingCount} {r.ratingCount === 1 ? "rating" : "ratings"}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RecommendedRow({ rows }: { rows: RecRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Recommended for you</h2>
        <span className="text-xs text-neutral-500">Based on your friends and overall taste</span>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory">
        {rows.map((r) => {
          const url = ytUrlForSongId(r.songId);
          const songLike = {
            id: r.songId,
            kind: (isAlbumId(r.songId) ? "album" : "song") as "song" | "album",
            title: r.title,
            artist: r.artist,
            album: r.album,
            thumbnail: r.thumbnail,
            durationSeconds: r.durationSeconds,
          };
          return (
            <div
              key={r.songId}
              className="shrink-0 w-44 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 snap-start flex flex-col"
            >
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="relative block">
                  {r.thumbnail ? (
                    <Image
                      src={r.thumbnail}
                      alt=""
                      width={160}
                      height={160}
                      className="rounded w-full aspect-square object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="rounded w-full aspect-square bg-neutral-800" />
                  )}
                </a>
              ) : r.thumbnail ? (
                <Image src={r.thumbnail} alt="" width={160} height={160} className="rounded w-full aspect-square object-cover" unoptimized />
              ) : (
                <div className="rounded w-full aspect-square bg-neutral-800" />
              )}
              <div className="mt-2 min-h-[40px]">
                <div className="font-medium text-sm truncate" title={r.title}>{r.title}</div>
                <div className="text-xs text-neutral-400 truncate" title={r.artist}>{r.artist}</div>
              </div>
              <div className="text-[11px] text-neutral-500 mt-1 truncate">{r.reason}</div>
              <div className="mt-2">
                <RateButton song={songLike} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function DiscoverPage() {
  const { userId } = await auth();
  const [recs, trending, top] = await Promise.all([
    recommendedForViewer(userId),
    trendingThisWeek(),
    topRated(),
  ]);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-neutral-400 text-sm">
          What everyone&apos;s rating right now and what&apos;s scored highest overall.
        </p>
      </div>

      <RecommendedRow rows={recs} />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Trending this week</h2>
          <span className="text-xs text-neutral-500">most rated · last 7 days</span>
        </div>
        <DiscoverList rows={trending} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Top rated</h2>
          <span className="text-xs text-neutral-500">highest avg · 2+ ratings</span>
        </div>
        <DiscoverList rows={top} />
      </section>
    </div>
  );
}
