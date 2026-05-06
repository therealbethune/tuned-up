import Image from "next/image";
import Link from "next/link";
import { and, desc, eq, count } from "drizzle-orm";
import { db, ratings, songs, follows, users } from "@/db";
import { FollowButton } from "./FollowButton";
import { ytUrlForSongId } from "@/lib/songs";

type User = typeof users.$inferSelect;

export default async function UserProfile({ target, viewerId }: { target: User; viewerId: string | null }) {
  const [rows, [followerStat], [followingStat], followingViewer] = await Promise.all([
    db
      .select({
        score: ratings.score,
        review: ratings.review,
        createdAt: ratings.createdAt,
        songId: songs.id,
        title: songs.title,
        artist: songs.artist,
        album: songs.album,
        thumbnail: songs.thumbnail,
      })
      .from(ratings)
      .innerJoin(songs, eq(ratings.songId, songs.id))
      .where(eq(ratings.userId, target.id))
      .orderBy(desc(ratings.createdAt))
      .limit(100),
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followeeId, target.id)),
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followerId, target.id)),
    viewerId && viewerId !== target.id
      ? db
          .select()
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, target.id)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const followersCount = followerStat?.n ?? 0;
  const followingCount = followingStat?.n ?? 0;
  const isFollowing = followingViewer.length > 0;

  const avg = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {target.imageUrl ? (
          <Image src={target.imageUrl} alt="" width={64} height={64} className="rounded-full h-16 w-16" unoptimized />
        ) : (
          <div className="h-16 w-16 rounded-full bg-neutral-700" />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{target.displayName || target.username}</h1>
          <p className="text-neutral-400 text-sm">@{target.username}</p>
        </div>
        {viewerId && viewerId !== target.id && (
          <FollowButton username={target.username} initiallyFollowing={isFollowing} />
        )}
      </div>

      <div className="flex gap-6 text-sm">
        <Link
          href={`/u/${target.username}/followers`}
          className="hover:text-white text-neutral-300 transition-colors"
        >
          <span className="font-bold text-white tabular-nums">{followersCount}</span>{" "}
          <span className="text-neutral-400">{followersCount === 1 ? "follower" : "followers"}</span>
        </Link>
        <Link
          href={`/u/${target.username}/following`}
          className="hover:text-white text-neutral-300 transition-colors"
        >
          <span className="font-bold text-white tabular-nums">{followingCount}</span>{" "}
          <span className="text-neutral-400">following</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-neutral-400">Songs rated</div>
          <div className="text-2xl font-bold">{rows.length}</div>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
          <div className="text-neutral-400">Average score</div>
          <div className="text-2xl font-bold tabular-nums">{avg ?? "—"}</div>
        </div>
      </div>

      <h2 className="text-lg font-semibold pt-2">Ratings</h2>
      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm">No ratings yet. <Link href="/search" className="underline">Rate something.</Link></p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const url = ytUrlForSongId(r.songId);
            return (
              <li key={r.songId} className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
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
                  <div className="text-sm text-neutral-400 truncate">{r.artist}{r.album ? ` · ${r.album}` : ""}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{r.score}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
