import Image from "next/image";
import Link from "next/link";
import { and, desc, eq, count, inArray } from "drizzle-orm";
import { db, ratings, songs, follows, users, comments, likes } from "@/db";
import { FollowButton } from "./FollowButton";
import { ytUrlForSongId } from "@/lib/songs";
import { OwnRatingForm } from "@/components/OwnRatingForm";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { StreamingLinks } from "@/components/StreamingLinks";
import { isAlbumId } from "@/lib/songs";
import { computeTasteAgreement } from "@/lib/taste";

type User = typeof users.$inferSelect;

export default async function UserProfile({ target, viewerId }: { target: User; viewerId: string | null }) {
  const isOwner = viewerId === target.id;
  const [[followerStat], [followingStat], followingViewer] = await Promise.all([
    db
      .select({ n: count() })
      .from(follows)
      .where(and(eq(follows.followeeId, target.id), eq(follows.status, "accepted"))),
    db
      .select({ n: count() })
      .from(follows)
      .where(and(eq(follows.followerId, target.id), eq(follows.status, "accepted"))),
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
  const taste = viewerId && !isOwner ? await computeTasteAgreement(viewerId, target.id) : null;
  const followRow = followingViewer[0];
  const followState: "none" | "pending" | "accepted" = !followRow
    ? "none"
    : followRow.status === "pending"
    ? "pending"
    : "accepted";
  const canSeeRatings = isOwner || !target.isPrivate || followState === "accepted";

  const rows = canSeeRatings
    ? await db
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
        .limit(100)
    : [];

  const avg = rows.length
    ? Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length)
    : null;

  // Comment + like counts for this user's ratings.
  const songIds = rows.map((r) => r.songId);
  let commentCounts: Map<string, number> = new Map();
  let likeCounts: Map<string, number> = new Map();
  let myLikes: Set<string> = new Set();
  if (songIds.length) {
    const [cCounts, lCounts, myLikeRows] = await Promise.all([
      db
        .select({ songId: comments.songId, n: count() })
        .from(comments)
        .where(and(eq(comments.ratingUserId, target.id), inArray(comments.songId, songIds)))
        .groupBy(comments.songId),
      db
        .select({ songId: likes.songId, n: count() })
        .from(likes)
        .where(and(eq(likes.ratingUserId, target.id), inArray(likes.songId, songIds)))
        .groupBy(likes.songId),
      viewerId
        ? db
            .select({ songId: likes.songId })
            .from(likes)
            .where(
              and(
                eq(likes.likerId, viewerId),
                eq(likes.ratingUserId, target.id),
                inArray(likes.songId, songIds),
              ),
            )
        : Promise.resolve([]),
    ]);
    commentCounts = new Map(cCounts.map((c) => [c.songId, Number(c.n)]));
    likeCounts = new Map(lCounts.map((l) => [l.songId, Number(l.n)]));
    myLikes = new Set(myLikeRows.map((l) => l.songId));
  }

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
          <FollowButton username={target.username} initialState={followState} />
        )}
      </div>

      {target.isPrivate && !canSeeRatings && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400 space-y-2">
          <div className="text-2xl">🔒</div>
          <p className="font-medium text-neutral-200">This account is private.</p>
          <p className="text-sm">
            {followState === "pending"
              ? "Your follow request is waiting to be approved."
              : "Follow to see their ratings — they'll need to approve your request."}
          </p>
        </div>
      )}

      {taste && (
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/5 p-4 flex items-center gap-4">
          <div className="text-3xl font-bold tabular-nums text-emerald-400">{taste.agreement}%</div>
          <div className="flex-1">
            <div className="font-medium">Taste agreement</div>
            <div className="text-sm text-neutral-400">
              Across {taste.shared} {taste.shared === 1 ? "song" : "songs"} you&apos;ve both rated.
            </div>
          </div>
        </div>
      )}

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

      {canSeeRatings && (
        <>
          <h2 className="text-lg font-semibold pt-2">Ratings</h2>
          {rows.length === 0 ? (
            <p className="text-neutral-500 text-sm">No ratings yet. <Link href="/search" className="underline">Rate something.</Link></p>
          ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const url = ytUrlForSongId(r.songId);
            return (
              <li key={r.songId} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                <div className="flex items-center gap-3">
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
                  <div className="flex items-center gap-2 min-w-0">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">
                        {r.title}
                      </a>
                    ) : (
                      <div className="font-medium truncate">{r.title}</div>
                    )}
                    {isAlbumId(r.songId) && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        Album
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-neutral-400 truncate">{r.artist}{r.album ? ` · ${r.album}` : ""}</div>
                </div>
                <div className="text-2xl font-bold tabular-nums">{r.score}</div>
                </div>
                {r.review && <p className="mt-3 text-sm text-neutral-300 whitespace-pre-wrap">{r.review}</p>}
                {isOwner && (
                  <div className="mt-3">
                    <OwnRatingForm rating={{ songId: r.songId, title: r.title, score: r.score, review: r.review }} />
                  </div>
                )}
                {viewerId && (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <LikeButton
                          ratingUserId={target.id}
                          songId={r.songId}
                          initialLiked={myLikes.has(r.songId)}
                          initialCount={likeCounts.get(r.songId) ?? 0}
                        />
                        <ShareButton username={target.username} songId={r.songId} />
                      </div>
                      <StreamingLinks songId={r.songId} title={r.title} artist={r.artist} />
                    </div>
                    <CommentSection
                      ratingUserId={target.id}
                      songId={r.songId}
                      viewerId={viewerId}
                      initialCount={commentCounts.get(r.songId) ?? 0}
                    />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
        </>
      )}
    </div>
  );
}
