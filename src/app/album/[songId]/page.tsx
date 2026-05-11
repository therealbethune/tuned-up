import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, songs, ratings, users, follows } from "@/db";
import { ytUrlForSongId, isAlbumId, relativeTime } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";
import { scoreLabel } from "@/lib/score-labels";
import { RateButton } from "@/components/RateButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";

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

  const [song] = await db
    .select()
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  if (!song) notFound();

  // All ratings for this item, joined to users for the reviewer rail.
  const allRatings = await db
    .select({
      score: ratings.score,
      review: ratings.review,
      createdAt: ratings.createdAt,
      raterId: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })
    .from(ratings)
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(eq(ratings.songId, songId))
    .orderBy(desc(ratings.createdAt))
    .limit(50);

  const total = allRatings.length;
  const avg = total > 0
    ? Math.round(allRatings.reduce((s, r) => s + r.score, 0) / total)
    : null;
  const myRow = userId ? allRatings.find((r) => r.raterId === userId) : null;

  // If the viewer is signed in, partition the recent ratings into
  // "people you follow" + "everyone else" so friends bubble to the top.
  // This is the big UX shift on the album page revamp: most users care
  // FAR more about how their friends rated a song than how random
  // strangers rated it, and the original render was strict reverse
  // chronological with no signal.
  let followedSet: Set<string> = new Set();
  if (userId) {
    const rows = await db
      .select({ followeeId: follows.followeeId })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.status, "accepted"),
          inArray(
            follows.followeeId,
            allRatings.map((r) => r.raterId).concat([userId]),
          ),
        ),
      );
    followedSet = new Set(rows.map((r) => r.followeeId));
  }
  const friendRatings = allRatings.filter(
    (r) => r.raterId !== userId && followedSet.has(r.raterId),
  );
  const otherRatings = allRatings.filter(
    (r) => r.raterId !== userId && !followedSet.has(r.raterId),
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
            <div className="pt-1 flex items-center gap-3 flex-wrap">
              <RateButton song={songForRate} initialScore={myRow?.score ?? null} />
              {myRow != null && (
                <span
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-neutral-800/80 border border-neutral-700 px-2.5 py-1 text-xs"
                  title="Your rating"
                >
                  <span className="text-neutral-400">You:</span>
                  <span className="font-bold tabular-nums text-emerald-400">{myRow.score}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Aggregate stats */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 sm:p-6 space-y-4">
        {total === 0 ? (
          <p className="text-center text-neutral-500 text-sm py-2">
            Be the first to rate {isAlbum ? "this album" : "this song"}.
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-5xl font-bold tabular-nums text-emerald-400">{avg}</span>
              {avg != null && (
                <span className={`text-base font-semibold ${scoreLabel(avg).color}`}>
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
              <span className="text-sm text-neutral-500 ml-auto">
                {total} {total === 1 ? "rating" : "ratings"}
              </span>
            </div>
            <div className="space-y-1.5">
              {buckets.map((b, i) => (
                <div key={b.label} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-neutral-500 tabular-nums">{b.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full ${b.color}`}
                      style={{ width: `${(counts[i] / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-neutral-400 tabular-nums">{counts[i]}</span>
                </div>
              ))}
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
        {r.imageUrl ? (
          <Image
            src={r.imageUrl}
            alt=""
            width={28}
            height={28}
            className="rounded-full h-7 w-7 shrink-0"
          />
        ) : (
          <div className="h-7 w-7 rounded-full bg-neutral-700 shrink-0" />
        )}
        <Link href={`/u/${r.username}`} className="text-sm font-medium hover:underline truncate">
          {r.displayName || r.username}
        </Link>
        <span className="text-xs text-neutral-500">{relativeTime(r.createdAt)}</span>
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
