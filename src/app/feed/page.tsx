import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, desc, eq, inArray, notInArray, sql, count } from "drizzle-orm";
import { db, ratings, songs, users, follows, comments, likes, spotifyAccounts } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { ytUrlForSongId } from "@/lib/songs";
import { RateButton } from "@/components/RateButton";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { StreamingLinks } from "@/components/StreamingLinks";
import { RecommendButton } from "@/components/RecommendButton";
import { SaveToSpotifyButton } from "@/components/SaveToSpotifyButton";
import { ConnectSpotifyBanner } from "@/components/ConnectSpotifyBanner";
import { isAlbumId, relativeTime } from "@/lib/songs";
import { scoreLabel } from "@/lib/score-labels";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const me = await syncCurrentUser();
  if (me && !me.onboardedAt) redirect("/welcome");

  const followedRows = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, userId), eq(follows.status, "accepted")));
  const followedIds = followedRows.map((r) => r.id);
  followedIds.push(userId); // include self

  const items = followedIds.length
    ? await db
        .select({
          ratingUserId: ratings.userId,
          score: ratings.score,
          review: ratings.review,
          createdAt: ratings.createdAt,
          songId: ratings.songId,
          title: songs.title,
          artist: songs.artist,
          album: songs.album,
          thumbnail: songs.thumbnail,
          appleMusicUrl: songs.appleMusicUrl,
          spotifyTrackId: songs.spotifyTrackId,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
        })
        .from(ratings)
        .innerJoin(songs, eq(ratings.songId, songs.id))
        .innerJoin(users, eq(ratings.userId, users.id))
        .where(inArray(ratings.userId, followedIds))
        .orderBy(desc(ratings.createdAt))
        .limit(50)
    : [];

  // Viewer's own ratings on the songs visible in the feed (so we can show
  // an accurate "Rated X" label on the inline RateButton).
  const songIds = Array.from(new Set(items.map((i) => i.songId)));
  const myRatingsRows = songIds.length
    ? await db
        .select({ songId: ratings.songId, score: ratings.score })
        .from(ratings)
        .where(and(eq(ratings.userId, userId), inArray(ratings.songId, songIds)))
    : [];
  const myRatingsMap = new Map(myRatingsRows.map((r) => [r.songId, r.score]));

  // Has the viewer linked their Spotify account? (Used to render the
  // "Save to Spotify" button on each rating card.)
  const [spotifyLink] = await db
    .select({ id: spotifyAccounts.userId })
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId));
  const spotifyConnected = Boolean(spotifyLink);

  // Comment counts per (ratingUserId, songId) grouped by both.
  let commentCounts: Map<string, number> = new Map();
  let likeCounts: Map<string, number> = new Map();
  let myLikes: Set<string> = new Set();
  if (items.length) {
    const ratingUserIds = Array.from(new Set(items.map((i) => i.ratingUserId)));

    const [cCounts, lCounts, myLikeRows] = await Promise.all([
      db
        .select({
          ratingUserId: comments.ratingUserId,
          songId: comments.songId,
          n: count(),
        })
        .from(comments)
        .where(
          and(
            inArray(comments.ratingUserId, ratingUserIds),
            inArray(comments.songId, songIds),
          ),
        )
        .groupBy(comments.ratingUserId, comments.songId),
      db
        .select({
          ratingUserId: likes.ratingUserId,
          songId: likes.songId,
          n: count(),
        })
        .from(likes)
        .where(
          and(
            inArray(likes.ratingUserId, ratingUserIds),
            inArray(likes.songId, songIds),
          ),
        )
        .groupBy(likes.ratingUserId, likes.songId),
      db
        .select({ ratingUserId: likes.ratingUserId, songId: likes.songId })
        .from(likes)
        .where(
          and(
            eq(likes.likerId, userId),
            inArray(likes.ratingUserId, ratingUserIds),
            inArray(likes.songId, songIds),
          ),
        ),
    ]);
    commentCounts = new Map(
      cCounts.map((c) => [`${c.ratingUserId}::${c.songId}`, Number(c.n)]),
    );
    likeCounts = new Map(
      lCounts.map((l) => [`${l.ratingUserId}::${l.songId}`, Number(l.n)]),
    );
    myLikes = new Set(myLikeRows.map((l) => `${l.ratingUserId}::${l.songId}`));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Feed</h1>
        <Link href="/search" className="text-sm text-neutral-400 hover:text-white">+ Rate a song</Link>
      </div>

      <ConnectSpotifyBanner connected={spotifyConnected} />

      {items.length === 0 ? (
        <EmptyFeed userId={userId} followedIds={followedIds} />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const url = ytUrlForSongId(it.songId);
            const myScore = myRatingsMap.get(it.songId) ?? null;
            const cKey = `${it.ratingUserId}::${it.songId}`;
            const cCount = commentCounts.get(cKey) ?? 0;
            const lCount = likeCounts.get(cKey) ?? 0;
            const iLiked = myLikes.has(cKey);
            const songLike = {
              id: it.songId,
              kind: (isAlbumId(it.songId) ? "album" : "song") as "song" | "album",
              title: it.title,
              artist: it.artist,
              album: it.album,
              thumbnail: it.thumbnail,
              durationSeconds: null,
            };
            return (
              <li key={`${it.username}-${it.songId}-${it.createdAt}`} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
                <div className="flex items-center gap-3 mb-3">
                  {it.imageUrl ? (
                    <Image src={it.imageUrl} alt="" width={28} height={28} className="rounded-full h-7 w-7" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-700" />
                  )}
                  <Link href={`/u/${it.username}`} className="text-sm font-medium hover:underline">
                    {it.displayName || it.username}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {relativeTime(it.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="relative shrink-0 group"
                      title="Open in YouTube Music"
                    >
                      {it.thumbnail ? (
                        <Image src={it.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover" />
                      ) : (
                        <div className="h-14 w-14 rounded bg-neutral-800" />
                      )}
                      <div className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                        <svg
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          width="20" height="20" viewBox="0 0 24 24" fill="white" aria-hidden
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </a>
                  ) : it.thumbnail ? (
                    <Image src={it.thumbnail} alt="" width={56} height={56} className="rounded h-14 w-14 object-cover shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">
                          {it.title}
                        </a>
                      ) : (
                        <div className="font-medium truncate">{it.title}</div>
                      )}
                      {isAlbumId(it.songId) && (
                        <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          Album
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-neutral-400 truncate">{it.artist}{it.album ? ` · ${it.album}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold tabular-nums">{it.score}</div>
                    <div className={`text-[11px] font-medium ${scoreLabel(it.score).color}`}>
                      {scoreLabel(it.score).label}
                    </div>
                  </div>
                </div>
                {it.review && <p className="mt-3 text-sm text-neutral-300 whitespace-pre-wrap">{it.review}</p>}

                {it.ratingUserId !== userId && (
                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-neutral-500">
                      {myScore != null ? "You also rated this" : "What do you think?"}
                    </span>
                    <div className="flex items-center gap-3">
                      <RecommendButton song={songLike} />
                      <RateButton song={songLike} initialScore={myScore} />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-4">
                    <LikeButton
                      ratingUserId={it.ratingUserId}
                      songId={it.songId}
                      initialLiked={iLiked}
                      initialCount={lCount}
                    />
                    <ShareButton username={it.username} songId={it.songId} />
                  </div>
                  <StreamingLinks
                    songId={it.songId}
                    title={it.title}
                    artist={it.artist}
                    appleMusicUrl={it.appleMusicUrl}
                    spotifyTrackId={it.spotifyTrackId}
                  />
                </div>

                {!isAlbumId(it.songId) && spotifyConnected && (
                  <div className="mt-2">
                    <SaveToSpotifyButton songId={it.songId} connected={spotifyConnected} />
                  </div>
                )}

                <CommentSection
                  ratingUserId={it.ratingUserId}
                  songId={it.songId}
                  viewerId={userId}
                  initialCount={cCount}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function EmptyFeed({ userId, followedIds }: { userId: string; followedIds: string[] }) {
  const exclude = Array.from(new Set([userId, ...followedIds]));
  const suggested = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      ratingsCount: count(ratings.userId),
    })
    .from(users)
    .leftJoin(ratings, eq(ratings.userId, users.id))
    .where(notInArray(users.id, exclude))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${ratings.userId})`))
    .limit(8);

  const withRatings = suggested.filter((u) => u.ratingsCount > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400 space-y-3">
        <p>Your feed is empty.</p>
        <p className="text-sm">
          Try <Link href="/discover" className="underline text-white">Discover</Link> to see what&apos;s trending,{" "}
          <Link href="/people" className="underline text-white">find people</Link> to follow,{" "}
          or <Link href="/search" className="underline text-white">rate a song</Link> to start your own feed.
        </p>
      </div>

      {withRatings.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Suggested for you</h2>
          <ul className="space-y-2">
            {withRatings.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/u/${u.username}`}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 p-3 transition-colors"
                >
                  {u.imageUrl ? (
                    <Image src={u.imageUrl} alt="" width={40} height={40} className="rounded-full h-10 w-10" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-neutral-700" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.displayName || u.username}</div>
                    <div className="text-sm text-neutral-400 truncate">@{u.username}</div>
                  </div>
                  <div className="text-sm text-neutral-500 tabular-nums">
                    {u.ratingsCount} {u.ratingsCount === 1 ? "rating" : "ratings"}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
