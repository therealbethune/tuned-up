import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, songs, ratings, users, follows, blocks } from "@/db";
import { or } from "drizzle-orm";
import { ytUrlForSongId, isAlbumId, relativeTime } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";
import { scoreLabel } from "@/lib/score-labels";
import { RateButton } from "@/components/RateButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { SaveToAppleMusicButton } from "@/components/SaveToAppleMusicButton";
import { Avatar } from "@/components/Avatar";
import { safeQuery } from "@/lib/safe-query";

export const dynamic = "force-dynamic";

// Aggregate page for a single song or album: cover art, average score,
// rating count, distribution histogram, and the latest reviews.
//
// URL: /album/<base64-songId>  (encoding lets us route ids like "yt:abc:def")
import { decodeBase64Url } from "@/lib/encoding";
import { renderWithMentions } from "@/lib/mentions";
function decodeSongId(s: string): string {
  try {
    return decodeBase64Url(s);
  } catch {
    return decodeURIComponent(s);
  }
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ songId: string }>;
}) {
  const { songId: enc } = await params;
  const songId = decodeSongId(enc);
  const { userId } = await auth();

  // All three queries are independent — fan out in one Promise.all so
  // the page renders in ~1 DB roundtrip instead of 3 sequential ones.
  // The song row is required (notFound on miss); the other two are
  // best-effort and short-circuit to empty on auth state.
  const [
    [song],
    rawRatings,
    followRows,
    blockRows,
  ] = await Promise.all([
    db.select().from(songs).where(eq(songs.id, songId)).limit(1),
    // All ratings for this item, joined to users for the reviewer rail.
    // We pull `isPrivate` so we can filter below — private users'
    // ratings must NOT show to non-followers (this page is also reachable
    // while logged-out, where the visibility check is "public users only").
    db
      .select({
        score: ratings.score,
        review: ratings.review,
        createdAt: ratings.createdAt,
        raterId: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        isPrivate: users.isPrivate,
      })
      .from(ratings)
      .innerJoin(users, eq(users.id, ratings.userId))
      .where(eq(ratings.songId, songId))
      .orderBy(desc(ratings.createdAt))
      .limit(50),
    // Viewer's accepted follows — used to filter private ratings and to
    // partition the reviewer rail into "people you follow" + "everyone
    // else". Skipped when logged out (acceptedFollows stays empty).
    userId
      ? db
          .select({ followeeId: follows.followeeId })
          .from(follows)
          .where(
            and(
              eq(follows.followerId, userId),
              eq(follows.status, "accepted"),
            ),
          )
      : Promise.resolve([] as { followeeId: string }[]),
    userId
      ? db
          .select({ blockerId: blocks.blockerId, blockedId: blocks.blockedId })
          .from(blocks)
          .where(or(eq(blocks.blockerId, userId), eq(blocks.blockedId, userId)))
      : Promise.resolve([] as { blockerId: string; blockedId: string }[]),
  ]);
  if (!song) notFound();

  const acceptedFollows = new Set(followRows.map((r) => r.followeeId));
  // Blocked-out raters disappear from the reviewer rail + the average
  // score calculation, in both directions (mine of them + theirs of me).
  const blockedIds = new Set<string>();
  for (const b of blockRows) {
    blockedIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
  }
  const allRatings = rawRatings.filter((r) => {
    if (blockedIds.has(r.raterId)) return false;
    if (!r.isPrivate) return true;
    if (userId && r.raterId === userId) return true;
    return acceptedFollows.has(r.raterId);
  });

  const total = allRatings.length;
  const avg = total > 0
    ? Math.round(allRatings.reduce((s, r) => s + r.score, 0) / total)
    : null;
  const myRow = userId ? allRatings.find((r) => r.raterId === userId) : null;

  // Partition the visible ratings into "people you follow" + "everyone
  // else" so friends bubble to the top. Strangers stay reverse-chrono.
  // (`acceptedFollows` is computed above for privacy filtering — we
  // reuse it here instead of issuing a second query.)
  const friendRatings = allRatings.filter(
    (r) => r.raterId !== userId && acceptedFollows.has(r.raterId),
  );
  const otherRatings = allRatings.filter(
    (r) => r.raterId !== userId && !acceptedFollows.has(r.raterId),
  );

  // Average computed over friends only — gives the viewer a personalized
  // signal alongside the global average. Null if no friend ratings.
  const friendAvg =
    friendRatings.length > 0
      ? Math.round(
          friendRatings.reduce((s, r) => s + r.score, 0) / friendRatings.length,
        )
      : null;

  // Histogram buckets: 1-19 / 20-39 / 40-59 / 60-79 / 80-100. Rough enough
  // to show distribution shape at a glance.
  const buckets = [
    { label: "1-19", min: 1, max: 19, color: "bg-red-500" },
    { label: "20-39", min: 20, max: 39, color: "bg-orange-500" },
    { label: "40-59", min: 40, max: 59, color: "bg-yellow-500" },
    { label: "60-79", min: 60, max: 79, color: "bg-lime-500" },
    { label: "80-100", min: 80, max: 100, color: "bg-emerald-500" },
  ];
  const counts = buckets.map((b) =>
    allRatings.filter((r) => r.score >= b.min && r.score <= b.max).length,
  );
  const maxCount = Math.max(1, ...counts);

  const isAlbum = isAlbumId(song.id) || song.kind === "album";
  const url = ytUrlForSongId(song.id);
  const songForRate = {
    id: song.id,
    kind: (isAlbum ? "album" : "song") as "song" | "album",
    title: song.title,
    artist: song.artist,
    album: song.album ?? null,
    thumbnail: song.thumbnail ?? null,
    durationSeconds: song.durationSeconds ?? null,
  };

  return (
    <div className="space-y-6">
      <Link href="/discover" className="text-sm text-neutral-400 hover:text-white">
        ← Back
      </Link>

      <header className="flex items-start gap-4 sm:gap-6">
        {song.thumbnail ? (
          url ? (
            <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
              <Image
                src={song.thumbnail}
                alt=""
                width={144}
                height={144}
                className="rounded-lg h-32 w-32 sm:h-36 sm:w-36 object-cover ring-2 ring-neutral-800"
              />
            </a>
          ) : (
            <Image
              src={song.thumbnail}
              alt=""
              width={144}
              height={144}
              className="rounded-lg h-32 w-32 sm:h-36 sm:w-36 object-cover ring-2 ring-neutral-800 shrink-0"
            />
          )
        ) : (
          <div className="h-32 w-32 sm:h-36 sm:w-36 rounded-lg bg-neutral-800 shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {song.title}
            </h1>
            {isAlbum && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Album
              </span>
            )}
          </div>
          <p className="text-neutral-400">
            {song.artist}
            {song.album && !isAlbum ? ` · ${song.album}` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <StreamingLinks
              songId={song.id}
              title={song.title}
              artist={song.artist}
              appleMusicUrl={song.appleMusicUrl}
              spotifyTrackId={song.spotifyTrackId}
            />
            {!isAlbum && <AudioPreviewButton songId={song.id} />}
          </div>
          {userId && (
            <>
              <div className="pt-1 flex items-center gap-3 flex-wrap">
                <RateButton song={songForRate} initialScore={myRow?.score ?? null} />
                {myRow != null && (
                  <span
                    className="inline-flex items-baseline gap-1.5 rounded-full bg-neutral-800/80 border border-neutral-700 px-2.5 py-1 text-xs"
                    title="Your rating"
                  >
                    <span className="text-neutral-400">You:</span>
                    <span className={`font-bold tabular-nums ${scoreLabel(myRow.score).color}`}>
                      {myRow.score}
                    </span>
                  </span>
                )}
              </div>
              {!isAlbum && (
                <div className="pt-1 flex flex-wrap items-center gap-2">
                  <SaveToAppleMusicButton songId={song.id} />
                </div>
              )}
            </>
          )}
        </div>
      </header>

      {/* Aggregate stats */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 space-y-4">
        {total === 0 ? (
          <p className="text-center text-neutral-400 text-sm py-2">
            Be the first to rate {isAlbum ? "this album" : "this song"}.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              {/* Hero score is the page's headline number — supersize
                  it (text-6xl/sm:text-7xl) with tight letter-spacing to
                  match how a magazine-style review card would treat its
                  rating. Used to be text-5xl; the extra weight reads as
                  more confident and matches the bigger label beside it. */}
              <span
                className="text-6xl sm:text-7xl font-extrabold tabular-nums tracking-tight text-emerald-400 leading-none"
                style={{ textShadow: "0 0 32px rgba(16, 185, 129, 0.35)" }}
              >
                {avg}
              </span>
              {avg != null && (
                <span className={`text-lg font-semibold ${scoreLabel(avg).color}`}>
                  {scoreLabel(avg).label}
                </span>
              )}
              {friendAvg != null && (
                <span
                  className="inline-flex items-baseline gap-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30 px-2.5 py-1 text-xs"
                  title={`Average across the ${friendRatings.length} ${friendRatings.length === 1 ? "person" : "people"} you follow who rated this`}
                >
                  <span>Friends:</span>
                  <span className="font-bold tabular-nums">{friendAvg}</span>
                </span>
              )}
              <span className="text-sm text-neutral-400 ml-auto">
                {total} {total === 1 ? "rating" : "ratings"}
              </span>
            </div>
            <div className="space-y-1.5">
              {buckets.map((b, i) => {
                // "You are here" marker: which bucket contains the
                // viewer's own score? Adds a small "You" chip next to
                // the count so the personal anchor jumps out from the
                // otherwise impersonal aggregate.
                const isMyBucket =
                  myRow != null && myRow.score >= b.min && myRow.score <= b.max;
                return (
                  <div key={b.label} className="flex items-center gap-2 text-xs">
                    <span className="w-12 text-neutral-400 tabular-nums">{b.label}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-neutral-800/80 overflow-hidden">
                      {/* bar-grow + a tiny per-bucket animation-delay so
                          the bars cascade in. The width factor stays
                          inline so the bar still has correct size at the
                          start of the keyframe (we scale, not animate
                          width, to keep the GPU path cheap). */}
                      <div
                        className={`h-full rounded-full bar-grow ${b.color} ${isMyBucket ? "saturate-150 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : ""}`}
                        style={{
                          width: `${(counts[i] / maxCount) * 100}%`,
                          animationDelay: `${i * 60}ms`,
                        }}
                      />
                    </div>
                    <span className="w-6 text-right text-neutral-400 tabular-nums">{counts[i]}</span>
                    {isMyBucket ? (
                      <span
                        className="text-[10px] font-semibold text-emerald-300 inline-flex items-center gap-0.5"
                        title={`Your rating: ${myRow!.score}`}
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
                          <path d="M4 0l4 6H0z" />
                        </svg>
                        You
                      </span>
                    ) : (
                      <span className="w-7" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Friend ratings — shown first because what your network thinks
          matters more than anonymous reviewers. Only renders when the
          viewer is signed in and at least one followed user has rated. */}
      {friendRatings.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-sky-300 uppercase tracking-wide mb-2">
            From people you follow
          </h2>
          <ul className="space-y-2">
            {friendRatings.map((r, i) => (
              <RatingCard key={`f-${r.raterId}-${i}`} r={r} />
            ))}
          </ul>
        </section>
      )}

      {/* Everyone else's ratings, reverse-chronological. */}
      {otherRatings.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            {friendRatings.length > 0 ? "Other ratings" : "Recent ratings"}
          </h2>
          <ul className="space-y-2">
            {otherRatings.map((r, i) => (
              <RatingCard key={`o-${r.raterId}-${i}`} r={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type RatingRow = {
  score: number;
  review: string | null;
  createdAt: Date;
  raterId: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
};

function RatingCard({ r }: { r: RatingRow }) {
  return (
    <li className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="flex items-center gap-2.5">
        <Avatar
          imageUrl={r.imageUrl}
          name={r.displayName || r.username}
          seed={r.raterId}
          size={28}
          ring={false}
        />
        <Link href={`/u/${r.username}`} className="text-sm font-medium hover:underline truncate">
          {r.displayName || r.username}
        </Link>
        <span className="text-xs text-neutral-400">{relativeTime(r.createdAt)}</span>
        <div className="ml-auto text-right">
          <div className="text-xl font-bold tabular-nums leading-none">{r.score}</div>
          <div className={`text-[10px] font-medium ${scoreLabel(r.score).color}`}>
            {scoreLabel(r.score).label}
          </div>
        </div>
      </div>
      {r.review && (
        <p className="mt-2 text-sm text-neutral-300 whitespace-pre-wrap break-words">
          {renderWithMentions(r.review)}
        </p>
      )}
    </li>
  );
}
