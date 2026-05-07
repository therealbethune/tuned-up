import Image from "next/image";
import Link from "next/link";
import { desc, sql, gte } from "drizzle-orm";
import { db, ratings, songs } from "@/db";
import { ytUrlForSongId } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";

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

export default async function DiscoverPage() {
  const [trending, top] = await Promise.all([trendingThisWeek(), topRated()]);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Discover</h1>
        <p className="text-neutral-400 text-sm">
          What everyone&apos;s rating right now and what&apos;s scored highest overall.
        </p>
      </div>

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
