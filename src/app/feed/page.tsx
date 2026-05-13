import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, desc, eq, inArray, lt, notInArray, sql, count } from "drizzle-orm";
import { db, ratings, songs, users, follows, comments, likes, savedSongs } from "@/db";
import { getBlockEdges } from "@/lib/block-edges";
import { syncCurrentUser } from "@/lib/sync-user";
import { ytUrlForSongId } from "@/lib/songs";
import { RateButton } from "@/components/RateButton";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { StreamingLinks } from "@/components/StreamingLinks";
import { RecommendButton } from "@/components/RecommendButton";
import { SaveToAppleMusicButton } from "@/components/SaveToAppleMusicButton";
import { ConnectMusicBanner } from "@/components/ConnectMusicBanner";
import { SafeCardBoundary } from "@/components/SafeCardBoundary";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { FriendRecsRail } from "@/components/FriendRecsRail";
import { recommendedFromFriends, type FriendRec } from "@/lib/recs";
import { Avatar } from "@/components/Avatar";
import { PlayIcon } from "@/components/icons";
import { ReportButton } from "@/components/ReportButton";
import { SaveLaterButton } from "@/components/SaveLaterButton";
import { TodaysPickCard } from "@/components/TodaysPickCard";
import { getDailyPick } from "@/lib/daily-pick";
import { SurpriseMeButton } from "@/components/SurpriseMeButton";
import { FirstFeedTour } from "@/components/FirstFeedTour";
import { isAlbumId, relativeTime } from "@/lib/songs";
import { scoreLabel, scoreTierGlow } from "@/lib/score-labels";
import { safeQuery } from "@/lib/safe-query";
import { encodeBase64Url } from "@/lib/encoding";
import { renderWithMentions } from "@/lib/mentions";
import { moodFor } from "@/lib/moods";

export const dynamic = "force-dynamic";

// How many feed items per page. We over-select by 1 so we can tell whether
// there are more items to load without a separate count query.
const FEED_PAGE_SIZE = 25;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; focus?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const me = await syncCurrentUser();
  if (me && !me.onboardedAt) redirect("/welcome");

  const sp = await searchParams;
  const beforeIso = sp.before;
  const beforeDate = beforeIso ? new Date(beforeIso) : null;

  // `?focus=<ratingUserId>:<songId>` forces inclusion of a specific
  // rating even if the viewer doesn't follow that user. Used by
  // /activity click-throughs so every notification reliably lands on
  // its rating's card in the feed, with the same context (comments,
  // likes, save buttons) the viewer already knows.
  let focusUserId: string | null = null;
  let focusSongId: string | null = null;
  if (sp.focus) {
    const idx = sp.focus.indexOf(":");
    if (idx > 0 && idx < sp.focus.length - 1) {
      focusUserId = sp.focus.slice(0, idx);
      focusSongId = sp.focus.slice(idx + 1);
    }
  }

  // Wrap the two core feed queries in safeQuery — same defensive
  // pattern as the rest of this file's data fetches. If either throws
  // (DB hiccup, missing column on a fresh migration, etc.) the page
  // renders the empty-feed state instead of 500-ing the whole route.
  // The instrumentation.ts hook + console.warn inside safeQuery
  // still log the real error so we can find it in Netlify logs.
  // Fan out the two upfront lookups in parallel: which users does the
  // viewer follow, and who's involved in a block edge with them?
  // Blocks hide content in BOTH directions so an abuser can't just
  // create a new account to dodge a mute.
  const [followedRows, blockEdges, dailyPick, [meStatus]] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({ id: follows.followeeId })
          .from(follows)
          .where(and(eq(follows.followerId, userId), eq(follows.status, "accepted"))),
      [] as { id: string }[],
      "feed-follows",
    ),
    getBlockEdges(userId),
    // Daily-pick card pinned to top of /feed. Suppressed when the
    // viewer is paginating (?before=…) so older pages don't show
    // today's prompt; only the first page of /feed does.
    sp.before ? Promise.resolve(null) : getDailyPick(userId),
    // Today's rating count for the viewer + cached streak. Drives the
    // "today: N rated · streak Y" pill in the header. Both come off
    // /users + a count() on /ratings; counting since 24h ago is good
    // enough without dragging in the user's timezone here.
    db
      .select({
        streak: users.currentStreak,
        today: sql<number>`(
          SELECT count(*)::int FROM ratings
          WHERE user_id = ${userId}
            AND created_at >= NOW() - INTERVAL '24 hours'
        )`,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ]);
  const todayCount = Number(meStatus?.today ?? 0);
  const currentStreak = Number(meStatus?.streak ?? 0);
  const { hiddenSet: hiddenIds } = blockEdges;
  const followedIds = followedRows.map((r) => r.id).filter((id) => !hiddenIds.has(id));
  followedIds.push(userId); // include self

  type FeedItemRow = {
    ratingUserId: string;
    score: number;
    review: string | null;
    mood: string | null;
    createdAt: Date;
    songId: string;
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    appleMusicUrl: string | null;
    spotifyTrackId: string | null;
    username: string;
    displayName: string | null;
    imageUrl: string | null;
    currentStreak: number;
  };
  const itemsPlusOne: FeedItemRow[] = followedIds.length
    ? await safeQuery<FeedItemRow[]>(
        () =>
          db
            .select({
              ratingUserId: ratings.userId,
              score: ratings.score,
              review: ratings.review,
              mood: ratings.mood,
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
              // Rater's cached streak so we can show a "🔥 N" pill on each
              // card. Refreshed on every new rating (refreshUserStreak in
              // /api/ratings) so this stays close to live without recomputing.
              currentStreak: users.currentStreak,
            })
            .from(ratings)
            .innerJoin(songs, eq(ratings.songId, songs.id))
            .innerJoin(users, eq(ratings.userId, users.id))
            .where(
              beforeDate
                ? and(
                    inArray(ratings.userId, followedIds),
                    lt(ratings.createdAt, beforeDate),
                  )
                : inArray(ratings.userId, followedIds),
            )
            .orderBy(desc(ratings.createdAt))
            .limit(FEED_PAGE_SIZE + 1),
        [],
        "feed-items",
      )
    : [];

  const hasMore = itemsPlusOne.length > FEED_PAGE_SIZE;
  let items = hasMore ? itemsPlusOne.slice(0, FEED_PAGE_SIZE) : itemsPlusOne;

  // If the activity-link supplied a focus and that rating isn't already
  // in the page, fetch + prepend it so the anchor scroll always finds
  // its target. Cheap — single-row lookup.
  //
  // Privacy: a rating from a private user is only visible to the viewer
  // if they own it OR they follow the user (accepted). Otherwise we
  // silently drop the focus so they can't bypass privacy via URL.
  if (
    focusUserId &&
    focusSongId &&
    !items.some((it) => it.ratingUserId === focusUserId && it.songId === focusSongId)
  ) {
    const focusedRows = await safeQuery(
      () =>
        db
          .select({
            ratingUserId: ratings.userId,
            score: ratings.score,
            review: ratings.review,
            mood: ratings.mood,
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
            currentStreak: users.currentStreak,
            ratingOwnerIsPrivate: users.isPrivate,
          })
          .from(ratings)
          .innerJoin(songs, eq(ratings.songId, songs.id))
          .innerJoin(users, eq(ratings.userId, users.id))
          .where(
            and(eq(ratings.userId, focusUserId), eq(ratings.songId, focusSongId)),
          )
          .limit(1),
      [],
      "feed-focus",
    );
    const focused = focusedRows[0];
    if (focused) {
      const ownerIsPrivate = focused.ratingOwnerIsPrivate;
      const viewerOwnsIt = focused.ratingUserId === userId;
      const viewerFollows = followedIds.includes(focused.ratingUserId);
      const allowed =
        !hiddenIds.has(focused.ratingUserId) &&
        (!ownerIsPrivate || viewerOwnsIt || viewerFollows);
      if (allowed) {
        // Strip the privacy-only field before merging into the items list
        // (the visible row type doesn't include it).
        const {
          ratingOwnerIsPrivate: _drop,
          ...rest
        } = focused;
        void _drop;
        items = [rest, ...items];
      }
    }
  }
  const oldestCreatedAt = items.length > 0 ? items[items.length - 1].createdAt : null;

  // Everything below depends on `items` being resolved but is otherwise
  // independent — fan out in one Promise.all rather than running each
  // query serially. On a warm /feed render this drops the after-items
  // wall-clock from ~6 sequential roundtrips to one parallel batch.
  type OtherRater = {
    songId: string;
    raterId: string;
    username: string;
    displayName: string | null;
    imageUrl: string | null;
    score: number;
  };
  const songIds = Array.from(new Set(items.map((i) => i.songId)));
  const ratingUserIds = Array.from(new Set(items.map((i) => i.ratingUserId)));
  const hasItems = items.length > 0;
  const wantsFriendRecs = followedIds.length > 0 && !sp.before;

  const [
    myRatingsRows,
    otherRaterRows,
    friendRecs,
    cCounts,
    lCounts,
    myLikeRows,
    mySavedRows,
  ] = await Promise.all([
    songIds.length
      ? safeQuery(
          () =>
            db
              .select({ songId: ratings.songId, score: ratings.score })
              .from(ratings)
              .where(and(eq(ratings.userId, userId), inArray(ratings.songId, songIds))),
          [] as { songId: string; score: number }[],
          "feed-my-ratings",
        )
      : Promise.resolve([] as { songId: string; score: number }[]),
    songIds.length && followedIds.length
      ? safeQuery<OtherRater[]>(
          () =>
            db
              .select({
                songId: ratings.songId,
                raterId: ratings.userId,
                username: users.username,
                displayName: users.displayName,
                imageUrl: users.imageUrl,
                score: ratings.score,
              })
              .from(ratings)
              .innerJoin(users, eq(users.id, ratings.userId))
              .where(
                and(
                  inArray(ratings.songId, songIds),
                  inArray(ratings.userId, followedIds),
                ),
              ),
          [],
          "feed-other-raters",
        )
      : Promise.resolve([] as OtherRater[]),
    // "Friends loved" rail — only on the first page (no `before` cursor)
    // so pagination doesn't reshuffle scroll position.
    wantsFriendRecs
      ? safeQuery(
          () => recommendedFromFriends(userId, 8),
          [] as FriendRec[],
          "feed-friend-recs",
        )
      : Promise.resolve([] as FriendRec[]),
    hasItems
      ? safeQuery(
          () =>
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
          [] as { ratingUserId: string; songId: string; n: number }[],
          "feed-comment-counts",
        )
      : Promise.resolve(
          [] as { ratingUserId: string; songId: string; n: number }[],
        ),
    hasItems
      ? safeQuery(
          () =>
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
          [] as { ratingUserId: string; songId: string; n: number }[],
          "feed-like-counts",
        )
      : Promise.resolve(
          [] as { ratingUserId: string; songId: string; n: number }[],
        ),
    hasItems
      ? safeQuery(
          () =>
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
          [] as { ratingUserId: string; songId: string }[],
          "feed-my-likes",
        )
      : Promise.resolve([] as { ratingUserId: string; songId: string }[]),
    songIds.length
      ? safeQuery(
          () =>
            db
              .select({ songId: savedSongs.songId })
              .from(savedSongs)
              .where(and(eq(savedSongs.userId, userId), inArray(savedSongs.songId, songIds))),
          [] as { songId: string }[],
          "feed-my-saved",
        )
      : Promise.resolve([] as { songId: string }[]),
  ]);
  const mySavedSet = new Set(mySavedRows.map((r) => r.songId));

  const myRatingsMap = new Map(myRatingsRows.map((r) => [r.songId, r.score]));
  const otherRatersBySong = new Map<string, OtherRater[]>();
  for (const r of otherRaterRows) {
    const arr = otherRatersBySong.get(r.songId) ?? [];
    arr.push(r);
    otherRatersBySong.set(r.songId, arr);
  }

  let commentCounts: Map<string, number> = new Map();
  let likeCounts: Map<string, number> = new Map();
  let myLikes: Set<string> = new Set();
  if (hasItems) {
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
      {/* Header stacks on mobile so the daily-counter pill never
          competes for width with Surprise Me + Rate-a-song. On sm
          (≥640px) the row collapses back to a single line. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Feed</h1>
          {(todayCount > 0 || currentStreak > 0) && (
            <span
              className="text-[11px] inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-2.5 py-1 text-neutral-300"
              title="Your rating activity today and current streak"
            >
              {todayCount > 0 && (
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span className="text-emerald-300 font-semibold">{todayCount}</span>
                  <span className="text-neutral-500">today</span>
                </span>
              )}
              {todayCount > 0 && currentStreak > 0 && <span className="text-neutral-700">·</span>}
              {currentStreak > 0 && (
                <span className="inline-flex items-baseline gap-1 tabular-nums">
                  <span aria-hidden>🔥</span>
                  <span className="font-semibold">{currentStreak}</span>
                  <span className="text-neutral-500">streak</span>
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <SurpriseMeButton />
          <Link href="/search" className="text-sm text-neutral-400 hover:text-white whitespace-nowrap">+ Rate a song</Link>
        </div>
      </div>

      {dailyPick && <TodaysPickCard pick={dailyPick} />}

      <FirstFeedTour />

      <ConnectMusicBanner />

      <FriendRecsRail recs={friendRecs} />

      {items.length === 0 ? (
        <EmptyFeed userId={userId} followedIds={followedIds} />
      ) : (
        <ul className="space-y-3">
          {items.map((it, idx) => {
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
            // Stable id so /feed#rating-<userId>-<encodedSongId> from
            // activity/notification links scrolls right to the card.
            // `data-target-highlight` + CSS keyframes in globals.css drive
            // the 3-second emerald glow that fades back to normal.
            const anchorId = `rating-${it.ratingUserId}-${encodeBase64Url(it.songId)}`;
            return (
              <SafeCardBoundary key={`${it.username}-${it.songId}-${it.createdAt}`}>
              <li
                id={anchorId}
                data-target-highlight=""
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:p-4 scroll-mt-[calc(env(safe-area-inset-top)+5rem)] hover:border-neutral-700 hover:bg-neutral-900/80 transition-colors cv-auto"
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Avatar
                    imageUrl={it.imageUrl}
                    name={it.displayName || it.username}
                    seed={it.ratingUserId}
                    size={28}
                    ring={false}
                  />
                  <Link href={`/u/${it.username}`} className="text-sm font-medium hover:underline">
                    {it.displayName || it.username}
                  </Link>
                  {(it.currentStreak ?? 0) >= 3 && (
                    <span
                      className="text-[10px] rounded-full px-1.5 py-0.5 bg-orange-500/15 text-orange-300 border border-orange-500/30 leading-none inline-flex items-center gap-0.5"
                      title={`${it.currentStreak}-day rating streak`}
                    >
                      <span aria-hidden>🔥</span>
                      <span className="tabular-nums">{it.currentStreak}</span>
                    </span>
                  )}
                  <span className="text-xs text-neutral-400">
                    {relativeTime(it.createdAt)}
                  </span>
                  {it.ratingUserId !== userId && (
                    <span className="ml-auto -my-1">
                      <ReportButton
                        target={{
                          type: "rating",
                          targetUserId: it.ratingUserId,
                          targetSongId: it.songId,
                        }}
                        compact
                      />
                    </span>
                  )}
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
                        <Image
                          src={it.thumbnail}
                          alt=""
                          width={56}
                          height={56}
                          // First card is the LCP candidate; everything
                          // below the fold stays lazy.
                          {...(idx === 0 ? { priority: true } : { loading: "lazy" })}
                          className="rounded h-14 w-14 object-cover"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded shimmer" />
                      )}
                      {/* Play affordance. On mobile: a small badge in
                          the corner shows the thumbnail is tappable
                          (no hover state exists). On desktop: a full
                          dark overlay reveals on hover. */}
                      <span className="sm:hidden absolute bottom-1 right-1 h-5 w-5 rounded-full bg-black/70 backdrop-blur-sm inline-flex items-center justify-center text-white">
                        <PlayIcon size={10} />
                      </span>
                      <div className="hidden sm:flex absolute inset-0 rounded bg-black/0 group-hover:bg-black/40 items-center justify-center transition-colors text-white">
                        <PlayIcon
                          size={20}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                    </a>
                  ) : it.thumbnail ? (
                    <Image src={it.thumbnail} alt="" width={56} height={56} loading="lazy" className="rounded h-14 w-14 object-cover shrink-0" />
                  ) : (
                    <div className="h-14 w-14 rounded shimmer shrink-0" />
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
                  <div className="text-right shrink-0 leading-tight">
                    {/* Score is the punchline of the card — give it
                        hero weight and color (the tier color, not just
                        plain white) so it reads as the card's verdict
                        at a glance. */}
                    <div className={`text-4xl sm:text-4xl font-bold tabular-nums ${scoreLabel(it.score).color} ${scoreTierGlow(it.score)}`}>
                      {it.score}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-neutral-400 mt-0.5">
                      {scoreLabel(it.score).label}
                    </div>
                  </div>
                </div>
                {(it.mood || it.review) && (
                  <div className="mt-3 space-y-2">
                    {(() => {
                      const m = moodFor(it.mood);
                      if (!m) return null;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${m.className}`}
                          title={`Vibe: ${m.label}`}
                        >
                          <span aria-hidden>{m.emoji}</span>
                          {m.label}
                        </span>
                      );
                    })()}
                    {it.review && (
                      <p
                        className="text-sm text-neutral-300 whitespace-pre-wrap break-words line-clamp-4 sm:line-clamp-none"
                        title={it.review}
                      >
                        {renderWithMentions(it.review)}
                      </p>
                    )}
                  </div>
                )}

                {/* "Other friends who rated this" avatar stack — collapsed
                    to 3 overlapping avatars + +N count. Self-excluded
                    since the viewer's own rating shows separately above,
                    and the rating-card's owner is excluded since the
                    whole card is about them. */}
                {(() => {
                  const others = (otherRatersBySong.get(it.songId) ?? []).filter(
                    (o) => o.raterId !== userId && o.raterId !== it.ratingUserId,
                  );
                  if (others.length === 0) return null;
                  const shown = others.slice(0, 3);
                  return (
                    <Link
                      href={`/album/${encodeBase64Url(it.songId)}`}
                      className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-400 hover:text-white"
                      title="See all ratings of this song"
                    >
                      <span className="inline-flex -space-x-1.5">
                        {shown.map((o) => (
                          <Avatar
                            key={o.raterId}
                            imageUrl={o.imageUrl}
                            name={o.displayName || o.username}
                            seed={o.raterId}
                            size={22}
                          />
                        ))}
                      </span>
                      <span className="text-neutral-300">
                        {shown.length === 1
                          ? (shown[0].displayName || shown[0].username)
                          : shown.length === 2
                            ? `${shown[0].displayName || shown[0].username} + 1`
                            : `${shown[0].displayName || shown[0].username} + ${others.length - 1}`}
                        <span className="text-neutral-400"> also rated</span>
                      </span>
                    </Link>
                  );
                })()}

                {it.ratingUserId !== userId && (
                  <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs text-neutral-400">
                      {myScore != null ? "You also rated this" : "What do you think?"}
                    </span>
                    <div className="flex items-center gap-3">
                      <RecommendButton song={songLike} />
                      <RateButton song={songLike} initialScore={myScore} />
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {!isAlbumId(it.songId) && (
                      <AudioPreviewButton songId={it.songId} />
                    )}
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

                {!isAlbumId(it.songId) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {myScore == null && it.ratingUserId !== userId && (
                      <SaveLaterButton
                        songId={it.songId}
                        initialSaved={mySavedSet.has(it.songId)}
                        song={{
                          id: it.songId,
                          kind: "song",
                          title: it.title,
                          artist: it.artist,
                          album: it.album,
                          thumbnail: it.thumbnail,
                          durationSeconds: null,
                        }}
                      />
                    )}
                    <SaveToAppleMusicButton songId={it.songId} />
                  </div>
                )}

                <CommentSection
                  ratingUserId={it.ratingUserId}
                  songId={it.songId}
                  viewerId={userId}
                  initialCount={cCount}
                />
              </li>
              </SafeCardBoundary>
            );
          })}
        </ul>
      )}

      {hasMore && oldestCreatedAt && (
        <div className="pt-2 flex justify-center">
          <Link
            href={`/feed?before=${encodeURIComponent(
              oldestCreatedAt instanceof Date
                ? oldestCreatedAt.toISOString()
                : String(oldestCreatedAt),
            )}`}
            className="rounded-full border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900 text-sm px-4 py-2 active:scale-95 transition"
          >
            Load older →
          </Link>
        </div>
      )}

      {beforeIso && (
        <div className="pt-2 flex justify-center">
          <Link
            href="/feed"
            className="text-xs text-neutral-400 hover:text-white"
          >
            ↑ Back to top
          </Link>
        </div>
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
    // Suggestions exclude private users — even surfacing their name +
    // rating count to a non-follower is more data than they consented
    // to share. They can still be found by direct username search.
    .where(and(notInArray(users.id, exclude), eq(users.isPrivate, false)))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${ratings.userId})`))
    .limit(8);

  const withRatings = suggested.filter((u) => u.ratingsCount > 0);

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl border border-emerald-500/30 bg-[radial-gradient(circle_at_top,theme(colors.emerald.500/0.18),theme(colors.neutral.950)_70%)] p-8 sm:p-10 text-center space-y-4 overflow-hidden">
        {/* Decorative stack: three rotated card silhouettes behind the
            copy, hinting at "your feed will look like this". Pure
            visual — no real data, just enough geometry to suggest
            momentum before the user has any. */}
        <div aria-hidden className="absolute inset-x-0 top-3 h-20 pointer-events-none flex justify-center">
          <div className="absolute -rotate-6 -translate-x-10 sm:-translate-x-16 w-44 h-16 rounded-xl border border-neutral-800 bg-neutral-900/80 opacity-50" />
          <div className="absolute rotate-3 translate-x-2 w-48 h-16 rounded-xl border border-neutral-800 bg-neutral-900/80 opacity-60" />
          <div className="absolute rotate-6 translate-x-12 sm:translate-x-20 w-44 h-16 rounded-xl border border-neutral-800 bg-neutral-900/80 opacity-50" />
        </div>
        <div className="relative pt-16">
          <h2 className="text-2xl font-bold tracking-tight">Your feed is quiet</h2>
          <p className="text-sm text-neutral-300 max-w-sm mx-auto mt-2">
            Follow people or rate a few songs and this turns into your friends&apos; track-by-track music diary.
          </p>
          <div className="flex items-center justify-center gap-2 pt-4 flex-wrap">
            <Link
              href="/search"
              className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-5 py-2 active:scale-95 transition-transform shadow-lg shadow-emerald-500/20"
            >
              + Rate a song
            </Link>
            <Link
              href="/people"
              className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-5 py-2 active:scale-95 transition-transform"
            >
              Find people
            </Link>
            <Link
              href="/discover"
              className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-5 py-2 active:scale-95 transition-transform"
            >
              Discover
            </Link>
          </div>
        </div>
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
                  <Avatar
                    imageUrl={u.imageUrl}
                    name={u.displayName || u.username}
                    seed={u.id}
                    size={40}
                    ring={false}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.displayName || u.username}</div>
                    <div className="text-sm text-neutral-400 truncate">@{u.username}</div>
                  </div>
                  <div className="text-sm text-neutral-400 tabular-nums">
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
