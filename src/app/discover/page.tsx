import Image from "next/image";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { encodeBase64Url } from "@/lib/encoding";
import { auth } from "@clerk/nextjs/server";
import { desc, sql, gte, eq, ne, and, or } from "drizzle-orm";
import { db, ratings, songs, users, follows, blocks } from "@/db";
import { WEEK_MS, MONTH_MS } from "@/lib/time-constants";
import { isAlbumId } from "@/lib/songs";
import { RateButton } from "@/components/RateButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { Avatar } from "@/components/Avatar";
import { scoreLabel } from "@/lib/score-labels";
import { recommendedFromFriends } from "@/lib/recs";
import { FriendRecsRail } from "@/components/FriendRecsRail";
import { safeQuery } from "@/lib/safe-query";
import { FollowButton } from "@/app/u/[username]/FollowButton";

export const dynamic = "force-dynamic";

type DiscoverRow = {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  appleMusicUrl: string | null;
  spotifyTrackId: string | null;
  durationSeconds: number | null;
  previewUrl: string | null;
  previewChecked: boolean;
  ratingCount: number;
  avgScore: number;
};

// /discover's trending + top-rated rails don't vary per viewer, so
// they're prime candidates for a global cache. `unstable_cache` keys
// the result globally for the named TTL; every viewer sees the same
// cached payload until expiry. 60s on trending (newish-data signal),
// 120s on top-rated (stable signal). Cuts /discover server time from
// ~300ms down to ~50ms on a warm cache.
const trendingThisWeek = unstable_cache(
  async (): Promise<DiscoverRow[]> => {
    const sevenDaysAgo = new Date(Date.now() - WEEK_MS);
    return safeQuery(
      () =>
        db
          .select({
            songId: songs.id,
            title: songs.title,
            artist: songs.artist,
            album: songs.album,
            thumbnail: songs.thumbnail,
            appleMusicUrl: songs.appleMusicUrl,
            spotifyTrackId: songs.spotifyTrackId,
            durationSeconds: songs.durationSeconds,
            previewUrl: songs.previewUrl,
            previewChecked: songs.previewChecked,
            ratingCount: sql<number>`count(${ratings.songId})::int`,
            avgScore: sql<number>`round(avg(${ratings.score}))::int`,
          })
          .from(ratings)
          .innerJoin(songs, sql`${songs.id} = ${ratings.songId}`)
          .where(gte(ratings.createdAt, sevenDaysAgo))
          .groupBy(songs.id)
          .orderBy(desc(sql`count(${ratings.songId})`))
          .limit(12),
      [],
      "discover-trending",
    );
  },
  ["discover-trending-v1"],
  { revalidate: 60, tags: ["discover-trending"] },
);

const topRated = unstable_cache(
  async (): Promise<DiscoverRow[]> => {
    return safeQuery(
      () =>
        db
          .select({
            songId: songs.id,
            title: songs.title,
            artist: songs.artist,
            album: songs.album,
            thumbnail: songs.thumbnail,
            appleMusicUrl: songs.appleMusicUrl,
            spotifyTrackId: songs.spotifyTrackId,
            durationSeconds: songs.durationSeconds,
            previewUrl: songs.previewUrl,
            previewChecked: songs.previewChecked,
            ratingCount: sql<number>`count(${ratings.songId})::int`,
            avgScore: sql<number>`round(avg(${ratings.score}))::int`,
          })
          .from(ratings)
          .innerJoin(songs, sql`${songs.id} = ${ratings.songId}`)
          .groupBy(songs.id)
          .having(sql`count(${ratings.songId}) >= 2`)
          .orderBy(desc(sql`avg(${ratings.score})`), desc(sql`count(${ratings.songId})`))
          .limit(12),
      [],
      "discover-top-rated",
    );
  },
  ["discover-top-rated-v1"],
  { revalidate: 120, tags: ["discover-top-rated"] },
);

type TopReviewer = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
};

type WeeklyLeader = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  weeklyRatings: number;
};

// People the viewer follows, ranked by how many songs they rated this
// week. Lightweight competition — "look how active your friends are"
// → "I want to be on this list too" → drives re-engagement. Returns
// the viewer too so they always see themselves on the leaderboard
// even if they're not following anyone yet.
async function friendLeaderboardThisWeek(viewerId: string | null): Promise<WeeklyLeader[]> {
  if (!viewerId) return [];
  const sevenDaysAgo = new Date(Date.now() - WEEK_MS);
  return safeQuery(
    () =>
      db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          weeklyRatings: sql<number>`count(${ratings.userId})::int`,
        })
        .from(users)
        .innerJoin(ratings, eq(ratings.userId, users.id))
        .leftJoin(
          follows,
          and(
            eq(follows.followerId, viewerId),
            eq(follows.followeeId, users.id),
            eq(follows.status, "accepted"),
          ),
        )
        .where(
          and(
            gte(ratings.createdAt, sevenDaysAgo),
            // The viewer themselves OR someone they follow (anti-join via
            // the leftJoin above on a follow with status=accepted).
            or(eq(users.id, viewerId), sql`${follows.followerId} IS NOT NULL`),
            // Block-aware exclusion.
            sql`NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${users.id})
                 OR (b.blocker_id = ${users.id} AND b.blocked_id = ${viewerId})
            )`,
          ),
        )
        .groupBy(users.id)
        .orderBy(desc(sql`count(${ratings.userId})`))
        .limit(5),
    [],
    "discover-weekly-leaderboard",
  );
}

// People with the most ratings in the last 30 days who the viewer
// isn't already following. Good "who to follow" signal — they're
// active and have rated enough that following them populates the feed.
async function topReviewers(viewerId: string | null): Promise<TopReviewer[]> {
  const thirtyDaysAgo = new Date(Date.now() - MONTH_MS);

  // Use an anti-join (LEFT JOIN + IS NULL) to exclude in one query
  // anyone the viewer already follows. The old two-step path pulled
  // EVERY follow row across the wire just to JS-filter — wasteful for
  // a user following hundreds of accounts.
  return safeQuery(
    () =>
      db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          ratingsCount: sql<number>`count(${ratings.userId})::int`,
        })
        .from(users)
        .innerJoin(ratings, eq(ratings.userId, users.id))
        .leftJoin(
          follows,
          and(
            eq(follows.followerId, viewerId ?? "__noone__"),
            eq(follows.followeeId, users.id),
          ),
        )
        .where(
          and(
            gte(ratings.createdAt, thirtyDaysAgo),
            // Hide private users from "People to follow" — exposing their
            // monthly rating count to non-followers leaks information.
            eq(users.isPrivate, false),
            viewerId ? ne(users.id, viewerId) : sql`true`,
            // Anti-join: only include rows where the viewer has NO
            // existing follow edge.
            viewerId ? sql`${follows.followerId} IS NULL` : sql`true`,
            // Block-aware: hide anyone the viewer has blocked, and
            // anyone who blocked the viewer. Both directions matter
            // so an abuser can't keep appearing as a recommended
            // friend after their target hit "Block".
            viewerId
              ? sql`NOT EXISTS (SELECT 1 FROM ${blocks} b WHERE (b.blocker_id = ${viewerId} AND b.blocked_id = ${users.id}) OR (b.blocker_id = ${users.id} AND b.blocked_id = ${viewerId}))`
              : sql`true`,
          ),
        )
        .groupBy(users.id)
        .having(sql`count(${ratings.userId}) >= 3`)
        .orderBy(desc(sql`count(${ratings.userId})`))
        .limit(8),
    [],
    "discover-top-reviewers",
  );
}

// Reusable square-art card for songs/albums on /discover. Used by
// both Trending and Top Rated grids. Photo-forward: artwork dominates,
// metadata sits underneath in a tight type rhythm, score chip floats
// on the art so the eye lands on the verdict first.
function DiscoverCard({ r }: { r: DiscoverRow }) {
  const isAlbum = isAlbumId(r.songId);
  const songLike = {
    id: r.songId,
    kind: (isAlbum ? "album" : "song") as "song" | "album",
    title: r.title,
    artist: r.artist,
    album: r.album,
    thumbnail: r.thumbnail,
    durationSeconds: r.durationSeconds,
  };
  const tier = scoreLabel(r.avgScore);
  return (
    <div className="card-elevated card-hover overflow-hidden flex flex-col group">
      <div className="relative">
        <Link
          href={`/album/${encodeBase64Url(r.songId)}`}
          className="block aspect-square-art relative"
          aria-label={`${r.title} by ${r.artist}`}
        >
          {r.thumbnail ? (
            <Image
              src={r.thumbnail}
              alt=""
              width={320}
              height={320}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="w-full h-full bg-neutral-800" />
          )}
          {/* Bottom scrim so the score chip + album badge always have
              contrast no matter how bright the artwork is. */}
          <div className="absolute inset-0 gradient-scrim opacity-80 pointer-events-none" />
          {/* Score chip — bigger, tier-colored, sits on the artwork. */}
          <span
            className={`absolute top-2.5 right-2.5 rounded-lg px-2 py-1 text-base font-extrabold tabular-nums leading-none bg-black/70 backdrop-blur-md shadow-lg ${tier.color}`}
          >
            {r.avgScore}
          </span>
          {isAlbum && (
            <span className="absolute top-2.5 left-2.5 label-eyebrow px-1.5 py-0.5 rounded-md bg-sky-500/25 text-sky-100 border border-sky-400/40 backdrop-blur-sm">
              Album
            </span>
          )}
        </Link>
        {!isAlbum && (
          <div className="absolute bottom-2.5 right-2.5 z-10">
            <AudioPreviewButton
              songId={r.songId}
              title={r.title}
              artist={r.artist}
              album={r.album}
              thumbnail={r.thumbnail}
              previewUrl={r.previewChecked ? r.previewUrl : undefined}
            />
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="min-h-[38px]">
          <Link
            href={`/album/${encodeBase64Url(r.songId)}`}
            className="font-semibold text-[14px] leading-tight line-clamp-1 hover:underline"
            title={r.title}
          >
            {r.title}
          </Link>
          <div
            className="text-[12px] text-neutral-400 truncate mt-0.5"
            title={r.artist}
          >
            {r.artist}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold ${tier.color}`}>
            {tier.label}
          </span>
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {r.ratingCount}&nbsp;{r.ratingCount === 1 ? "rating" : "ratings"}
          </span>
        </div>
        <RateButton song={songLike} />
      </div>
    </div>
  );
}

function DiscoverGrid({ rows }: { rows: DiscoverRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-neutral-400 text-sm">
        Not enough ratings yet. Be the first — head to{" "}
        <Link href="/search" className="underline">Search</Link>.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {rows.map((r) => (
        <DiscoverCard key={r.songId} r={r} />
      ))}
    </div>
  );
}

// Hero spotlight: the single hottest pick for this viewer. Picks the
// top friend-rec when available, falls back to the #1 trending. Big
// art on the left, blurb + score on the right. Mobile stacks them.
function HeroSpotlight({
  songId,
  title,
  artist,
  thumbnail,
  durationSeconds,
  previewUrl,
  previewChecked,
  ratingCount,
  avgScore,
  badge,
}: {
  songId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  previewUrl: string | null;
  previewChecked: boolean;
  ratingCount: number;
  avgScore: number;
  badge: string;
}) {
  const isAlbum = isAlbumId(songId);
  const songLike = {
    id: songId,
    kind: (isAlbum ? "album" : "song") as "song" | "album",
    title,
    artist,
    album: null,
    thumbnail,
    durationSeconds,
  };
  const tier = scoreLabel(avgScore);
  return (
    <section className="card-hero relative">
      {/* Layer 1: blurred art behind, acts as a colored bed for the
          actual image card. The huge blur softens the album art into
          a halo so the foreground composition has a glow without
          needing a server-side color extraction. */}
      {thumbnail && (
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{
            backgroundImage: `url(${thumbnail})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(48px) saturate(140%)",
            transform: "scale(1.15)",
          }}
          aria-hidden
        />
      )}
      {/* Layer 2: dark vignette over the blur so the foreground text
          stays readable regardless of art brightness. */}
      <div className="absolute inset-0 bg-black/55 pointer-events-none" aria-hidden />
      <div className="absolute inset-0 gradient-spotlight pointer-events-none" aria-hidden />

      <div className="relative flex flex-col sm:flex-row gap-5 sm:gap-7 p-5 sm:p-7">
        <div className="relative shrink-0 mx-auto sm:mx-0">
          <Link
            href={`/album/${encodeBase64Url(songId)}`}
            className="block"
            aria-label={`${title} by ${artist}`}
          >
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt=""
                width={240}
                height={240}
                priority
                className="rounded-xl w-44 h-44 sm:w-52 sm:h-52 object-cover ring-1 ring-white/10 shadow-2xl"
              />
            ) : (
              <div className="w-44 h-44 sm:w-52 sm:h-52 rounded-xl bg-neutral-800" />
            )}
          </Link>
          {!isAlbum && (
            <div className="absolute bottom-2.5 right-2.5">
              <AudioPreviewButton
                songId={songId}
                title={title}
                artist={artist}
                thumbnail={thumbnail}
                previewUrl={previewChecked ? previewUrl : undefined}
              />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-3">
          {/* Sunset gradient pill for the "hot" signal — replaces the
              emerald eyebrow so the hero pops vs the rest of the page. */}
          <span className="pill-hot self-start sm:self-start mx-auto sm:mx-0">
            <span aria-hidden>★</span>
            {badge}
          </span>

          <h2 className="display text-white">
            <Link
              href={`/album/${encodeBase64Url(songId)}`}
              className="hover:underline decoration-white/30 underline-offset-4"
            >
              {title}
            </Link>
          </h2>
          <p className="text-lg text-neutral-300 -mt-1">{artist}</p>

          <div className="flex items-center gap-4 mt-1 flex-wrap">
            <span
              className={`score-chip text-6xl sm:text-7xl tier-glow-emerald ${tier.color}`}
              style={{ textShadow: `0 0 36px rgb(var(--tu-emerald-shadow) / 0.35)` }}
            >
              {avgScore}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className={`text-sm font-bold uppercase tracking-wider ${tier.color}`}>
                {tier.label}
              </span>
              <span className="text-xs text-neutral-400 tabular-nums">
                {ratingCount}&nbsp;{ratingCount === 1 ? "rating" : "ratings"}
              </span>
            </div>
          </div>
          <div className="pt-2">
            <RateButton song={songLike} />
          </div>
        </div>
      </div>
    </section>
  );
}

// Weekly leaderboard — your follows ranked by ratings this week, with
// you on the list so the comparison is immediate. Tier ribbons on
// rank 1-3 turn it into a tiny competition without being heavy-handed.
function WeeklyLeaderboardSection({
  viewerId,
  leaders,
}: {
  viewerId: string;
  leaders: WeeklyLeader[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">This week, with you and your follows</h2>
        <span className="text-xs text-neutral-500">Last 7 days</span>
      </div>
      <ol className="rounded-xl border border-neutral-800 bg-neutral-900/50 divide-y divide-neutral-800/60 overflow-hidden">
        {leaders.map((u, i) => {
          const isMe = u.id === viewerId;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <li key={u.id}>
              <Link
                href={`/u/${u.username}`}
                className={`flex items-center gap-3 p-3 hover:bg-neutral-900 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
                  isMe ? "bg-emerald-500/5" : ""
                }`}
              >
                <div className="w-6 text-center text-sm tabular-nums text-neutral-500 shrink-0">
                  {medal ?? `#${i + 1}`}
                </div>
                <Avatar
                  imageUrl={u.imageUrl}
                  name={u.displayName || u.username}
                  seed={u.id}
                  size={36}
                  ring={false}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate inline-flex items-center gap-1.5">
                    {u.displayName || u.username}
                    {isMe && (
                      <span className="text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 truncate">@{u.username}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums">{u.weeklyRatings}</div>
                  <div className="text-[10px] uppercase tracking-wider text-neutral-500">rated</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TopReviewersSection({ reviewers }: { reviewers: TopReviewer[] }) {
  if (reviewers.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">People to follow</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Most active raters in the last 30 days
          </p>
        </div>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-3 snap-x snap-mandatory">
        {reviewers.map((u) => (
          <div
            key={u.id}
            className="shrink-0 w-40 rounded-xl border border-neutral-800 bg-gradient-to-b from-neutral-900 to-neutral-950 p-3 snap-start flex flex-col items-center text-center gap-2 hover:border-neutral-700 transition-colors"
          >
            <Link href={`/u/${u.username}`} className="block">
              <Avatar
                imageUrl={u.imageUrl}
                name={u.displayName || u.username}
                seed={u.id}
                size={56}
                ring={false}
              />
            </Link>
            <div className="min-h-[36px] w-full">
              <Link
                href={`/u/${u.username}`}
                className="font-semibold text-sm truncate block hover:underline"
              >
                {u.displayName || u.username}
              </Link>
              <div className="text-[11px] text-neutral-400 truncate">
                @{u.username}
              </div>
            </div>
            <div className="text-[10px] text-neutral-400 tabular-nums">
              {u.ratingsCount} {u.ratingsCount === 1 ? "rating" : "ratings"} this month
            </div>
            <div className="w-full">
              <FollowButton username={u.username} initialState="none" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function DiscoverPage() {
  const { userId } = await auth();

  const [friendRecs, trending, top, reviewers, weeklyLeaders] = await Promise.all([
    userId
      ? safeQuery(() => recommendedFromFriends(userId, 12), [], "discover-friend-recs")
      : Promise.resolve([]),
    trendingThisWeek(),
    topRated(),
    topReviewers(userId),
    friendLeaderboardThisWeek(userId),
  ]);

  // Pick a hero. Prefer the top friend-rec since it's the most
  // personalized signal; fall back to trending, then top rated. Both
  // fall-through cases use the global signal as the badge label.
  let hero:
    | (DiscoverRow & { badge: string })
    | null = null;
  if (friendRecs.length > 0) {
    const t = friendRecs[0];
    hero = {
      songId: t.songId,
      title: t.title,
      artist: t.artist,
      album: t.album,
      thumbnail: t.thumbnail,
      appleMusicUrl: t.appleMusicUrl,
      spotifyTrackId: t.spotifyTrackId,
      durationSeconds: t.durationSeconds,
      previewUrl: t.previewUrl,
      previewChecked: t.previewChecked,
      ratingCount: t.friendCount,
      avgScore: t.friendAvg,
      badge:
        t.friendCount === 1
          ? "1 friend loved this"
          : `${t.friendCount} friends loved this`,
    };
  } else if (trending.length > 0) {
    hero = { ...trending[0], badge: "Trending now" };
  } else if (top.length > 0) {
    hero = { ...top[0], badge: "Top rated" };
  }

  return (
    <div className="space-y-10">
      {/* Page header — larger display type, paired eyebrow for rhythm. */}
      <div className="space-y-1.5">
        <span className="label-eyebrow text-emerald-300">For you · Today</span>
        <h1 className="headline-xl">Discover</h1>
        <p className="text-neutral-400 text-[15px] max-w-prose">
          What everyone&apos;s rating, who&apos;s rating it, and what your network loved.
        </p>
      </div>

      {hero && (
        <HeroSpotlight
          songId={hero.songId}
          title={hero.title}
          artist={hero.artist}
          thumbnail={hero.thumbnail}
          durationSeconds={hero.durationSeconds}
          previewUrl={hero.previewUrl}
          previewChecked={hero.previewChecked}
          ratingCount={hero.ratingCount}
          avgScore={hero.avgScore}
          badge={hero.badge}
        />
      )}

      {/* Reuse the same rail design as /feed for friend recs — visual
          consistency across the app, and you get the same audio
          preview + avatar stack pattern for free. */}
      <FriendRecsRail recs={friendRecs} />

      {/* Trending — horizontal rail (Instagram-story feel) so the swipe
          affordance suggests "there's more here" without consuming
          three rows of vertical space. */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="section-eyebrow">This week</span>
            <h2 className="section-title">Trending now</h2>
          </div>
        </div>
        {trending.length === 0 ? (
          <EmptyState
            emoji="📊"
            title="Not enough ratings yet"
            body="Be the first to rate this week."
          />
        ) : (
          <div className="rail scrollbar-hide cv-auto">
            {trending.map((r) => (
              <div key={r.songId} className="w-44 sm:w-52">
                <DiscoverCard r={r} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top rated — full grid, this is the "browse-y" section. Cards
          land here at their full size + metadata. */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <span className="section-eyebrow">All-time</span>
            <h2 className="section-title">Top rated</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Highest average · 2+ ratings</p>
          </div>
        </div>
        <DiscoverGrid rows={top} />
      </section>

      {userId && weeklyLeaders.length > 0 && (
        <WeeklyLeaderboardSection viewerId={userId} leaders={weeklyLeaders} />
      )}

      {userId && <TopReviewersSection reviewers={reviewers} />}
    </div>
  );
}

// Generic empty-state for in-page sections. Used when a particular
// Discover rail has nothing to show yet — better than rendering
// nothing (which looked like a layout bug).
function EmptyState({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="card-flat px-5 py-7 text-center space-y-2">
      <div className="text-3xl">{emoji}</div>
      <p className="font-medium">{title}</p>
      <p className="text-xs text-neutral-400">{body}</p>
    </div>
  );
}
