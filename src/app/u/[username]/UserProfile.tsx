import Image from "next/image";
import Link from "next/link";
import { and, desc, eq, count, inArray } from "drizzle-orm";
import { db, ratings, songs, follows, users, comments, likes, spotifyAccounts } from "@/db";
import { SpotifyIcon } from "@/components/icons";
import { renderWithMentions } from "@/lib/mentions";
import { FollowButton } from "./FollowButton";
import { ytUrlForSongId } from "@/lib/songs";
import { OwnRatingForm } from "@/components/OwnRatingForm";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { StreamingLinks } from "@/components/StreamingLinks";
import { isAlbumId } from "@/lib/songs";
import { computeTasteDetails } from "@/lib/taste";
import { computeStreak } from "@/lib/streak";
import { streakPercentile } from "@/lib/streak-milestones";
import { safeQuery } from "@/lib/safe-query";
import { TasteComparePanel } from "@/components/TasteComparePanel";

type User = typeof users.$inferSelect;

// Visual tier for the streak badge so longer streaks pop more.
function streakTierEmoji(streak: number): string {
  if (streak >= 365) return "🏆";
  if (streak >= 100) return "💎";
  if (streak >= 60) return "🥇";
  if (streak >= 30) return "🥈";
  if (streak >= 14) return "🥉";
  return "🔥";
}

// Friendly "joined" phrase for the profile header.
function joinedAgo(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days <= 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

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
  const [taste, streak, targetSpotify, viewer] = await Promise.all([
    viewerId && !isOwner
      ? safeQuery(() => computeTasteDetails(viewerId, target.id), null, "taste")
      : Promise.resolve(null),
    safeQuery(() => computeStreak(target.id), 0, "streak"),
    // Whether the profile owner has linked Spotify — shows a green
    // Spotify chip in the header. Public info; doesn't expose tokens.
    safeQuery(
      () =>
        db
          .select({ spotifyUserId: spotifyAccounts.spotifyUserId })
          .from(spotifyAccounts)
          .where(eq(spotifyAccounts.userId, target.id))
          .limit(1)
          .then((r) => r[0] ?? null),
      null,
      "target-spotify",
    ),
    // Viewer's own display name for the compare panel labels — falls
    // back to "You" if the lookup fails or the user isn't signed in.
    viewerId
      ? safeQuery(
          () =>
            db
              .select({ username: users.username, displayName: users.displayName })
              .from(users)
              .where(eq(users.id, viewerId))
              .limit(1)
              .then((r) => r[0] ?? null),
          null,
          "viewer-name",
        )
      : Promise.resolve(null),
  ]);
  // Top X% percentile shown alongside the streak badge. Defensive: if the
  // streak-cache columns aren't migrated yet, fall back to "no badge".
  const streakPct = streak > 0
    ? Math.max(1, 100 - (await safeQuery(() => streakPercentile(streak), 0, "streak-pct")))
    : 0;
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
          appleMusicUrl: songs.appleMusicUrl,
          spotifyTrackId: songs.spotifyTrackId,
        })
        .from(ratings)
        .innerJoin(songs, eq(ratings.songId, songs.id))
        .where(eq(ratings.userId, target.id))
        .orderBy(desc(ratings.createdAt))
        .limit(100)
    : [];

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
      {/* Header: avatar + name + streak + follow */}
      <div className="flex items-start gap-4">
        {target.imageUrl ? (
          <Image
            src={target.imageUrl}
            alt=""
            width={80}
            height={80}
            className="rounded-full h-20 w-20 ring-2 ring-neutral-800 shrink-0"

          />
        ) : (
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 ring-2 ring-neutral-800 shrink-0 flex items-center justify-center text-2xl font-bold text-neutral-300">
            {(target.displayName || target.username).charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0 pt-1 space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight truncate leading-tight">
            {target.displayName || target.username}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-neutral-400 text-sm">@{target.username}</span>
            {targetSpotify && (
              <span
                className="text-xs inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                title={`Spotify connected${targetSpotify.spotifyUserId ? ` as ${targetSpotify.spotifyUserId}` : ""}`}
              >
                <SpotifyIcon size={12} />
                Spotify
              </span>
            )}
            {streak > 0 && (
              <span
                className="text-xs rounded-full px-2 py-0.5 bg-gradient-to-r from-orange-500/20 to-amber-500/20 text-orange-300 border border-orange-500/40 tabular-nums font-medium"
                title={`${streak}-day rating streak — top ${streakPct}% of streak holders`}
              >
                {streakTierEmoji(streak)} {streak}-day streak
                {streakPct > 0 && streakPct <= 50 && (
                  <span className="ml-1 text-amber-200/80">· top {streakPct}%</span>
                )}
              </span>
            )}
            {target.createdAt && (
              <span className="text-xs text-neutral-500" title={new Date(target.createdAt).toLocaleString()}>
                Joined {joinedAgo(target.createdAt)}
              </span>
            )}
          </div>
        </div>
        {viewerId && viewerId !== target.id && (
          <div className="pt-1 shrink-0 flex flex-col items-end gap-1.5">
            <FollowButton username={target.username} initialState={followState} />
            <Link
              href={`/u/${target.username}/recs`}
              className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1"
              title="Rec history with this user"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M3 11l18-8-8 18-2-8-8-2z" />
              </svg>
              Recs
            </Link>
          </div>
        )}
      </div>

      {/* Followers / following / stats — single row, all clickable. The
          stats link is the universal entry to /u/[username]/stats. */}
      <div className="flex items-center gap-5 text-sm border-y border-neutral-800 py-3">
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
        {canSeeRatings && rows.length > 0 && (
          <Link
            href={`/u/${target.username}/stats`}
            className="ml-auto inline-flex items-center gap-1 text-neutral-300 hover:text-white transition-colors"
          >
            <span className="font-bold text-white tabular-nums">{rows.length}</span>
            <span className="text-neutral-400">ratings</span>
            <span className="text-neutral-500 ml-1">→</span>
          </Link>
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
        <TasteComparePanel
          agreement={taste.agreement}
          shared={taste.shared}
          agree={taste.agree}
          disagree={taste.disagree}
          viewerName={viewer?.displayName || viewer?.username || "You"}
          targetName={target.displayName || target.username}
        />
      )}

      {canSeeRatings && (
        <>
          <h2 className="text-lg font-semibold pt-2">Ratings</h2>
          {rows.length === 0 ? (
            <p className="text-neutral-500 text-sm">
              No ratings yet. <Link href="/search" className="underline">Rate something.</Link>
            </p>
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
                            <Image src={r.thumbnail} alt="" width={48} height={48} className="rounded h-12 w-12 object-cover" />
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
                        <Image src={r.thumbnail} alt="" width={48} height={48} className="rounded h-12 w-12 object-cover shrink-0" />
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
                        <div className="text-sm text-neutral-400 truncate">
                          {r.artist}{r.album ? ` · ${r.album}` : ""}
                        </div>
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{r.score}</div>
                    </div>
                    {r.review && (
                      <p className="mt-3 text-sm text-neutral-300 whitespace-pre-wrap break-words">
                        {renderWithMentions(r.review)}
                      </p>
                    )}
                    {isOwner && (
                      <div className="mt-3">
                        <OwnRatingForm rating={{ songId: r.songId, title: r.title, score: r.score, review: r.review }} />
                      </div>
                    )}
                    {viewerId && (
                      <>
                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-4">
                            <LikeButton
                              ratingUserId={target.id}
                              songId={r.songId}
                              initialLiked={myLikes.has(r.songId)}
                              initialCount={likeCounts.get(r.songId) ?? 0}
                            />
                            <ShareButton username={target.username} songId={r.songId} />
                          </div>
                          <StreamingLinks
                            songId={r.songId}
                            title={r.title}
                            artist={r.artist}
                            appleMusicUrl={r.appleMusicUrl}
                            spotifyTrackId={r.spotifyTrackId}
                          />
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
