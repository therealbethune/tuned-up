import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SignUpButton } from "@clerk/nextjs";
import { and, eq } from "drizzle-orm";
import { db, ratings, songs, users } from "@/db";
import { renderWithMentions } from "@/lib/mentions";
import { ytUrlForSongId } from "@/lib/songs";
import { StreamingLinks } from "@/components/StreamingLinks";
import { scoreLabel } from "@/lib/score-labels";
import { Avatar } from "@/components/Avatar";
import { canViewRatingsFrom } from "@/lib/visibility";

export const dynamic = "force-dynamic";

// Public, unauthenticated rating-share page.
// URL: /r/<username>/<songId-base64>  (we store songId base64-encoded so
// the `:` in `yt:<videoId>` doesn't break URL routing.)

// Re-exports kept so other pages that imported these names still work.
import { encodeBase64Url, decodeBase64Url } from "@/lib/encoding";
function decodeSongId(s: string): string {
  // Tolerant: either url-safe base64 or the literal id with %3A (colon).
  try {
    return decodeBase64Url(s);
  } catch {
    return decodeURIComponent(s);
  }
}
export const encodeSongIdForUrl = encodeBase64Url;

async function loadRating(username: string, encodedSongId: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) return null;

  const songId = decodeSongId(encodedSongId);
  const [row] = await db
    .select({
      ratingUserId: ratings.userId,
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
      kind: songs.kind,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      isPrivate: users.isPrivate,
    })
    .from(ratings)
    .innerJoin(songs, eq(ratings.songId, songs.id))
    .innerJoin(users, eq(users.id, ratings.userId))
    .where(and(eq(ratings.userId, user.id), eq(ratings.songId, songId)))
    .limit(1);

  return row ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; songId: string }>;
}): Promise<Metadata> {
  const { username, songId } = await params;
  const r = await loadRating(username, songId);
  if (!r) return { title: "Tuned Up" };

  // Don't leak score/review through OG / Twitter card metadata if the
  // rating owner is private. The viewer of a metadata fetch is almost
  // always a bot (Slack, iMessage, X, Discord) — we have no userId to
  // gate on, so private = generic fallback.
  if (r.isPrivate) {
    return {
      title: "Tuned Up",
      description: "A music-rating social network.",
    };
  }

  const titleStr = `@${r.username} rated ${r.title} — ${r.score}/100`;
  const desc = r.review ?? `${r.artist} · ${r.score}/100 on Tuned Up`;
  const ogImage = `/api/og/rating?u=${encodeURIComponent(r.username)}&s=${encodeURIComponent(r.songId)}`;

  return {
    title: titleStr,
    description: desc,
    openGraph: {
      title: titleStr,
      description: desc,
      type: "article",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: titleStr,
      description: desc,
      images: [ogImage],
    },
  };
}

export default async function SharedRatingPage({
  params,
}: {
  params: Promise<{ username: string; songId: string }>;
}) {
  const { username, songId } = await params;
  const r = await loadRating(username, songId);
  if (!r) notFound();

  const { userId } = await auth();

  // Privacy gate: a private user's share URLs should still resolve for
  // the owner and for accepted followers, but for everyone else (incl.
  // logged-out viewers reached via copied link, search-engine bots, or
  // OG-card-fetching bots) we 404 to prevent the URL from leaking
  // score + review. Public users always pass.
  if (r.isPrivate && !(await canViewRatingsFrom(userId ?? "", r.ratingUserId))) {
    notFound();
  }

  // Signed-in users: bounce them into the feed-focus view so we have one
  // canonical destination + they get the full feed context (comments,
  // likes, save buttons) inline instead of the bare share page.
  if (userId) {
    redirect(
      `/feed?focus=${r.ratingUserId}:${encodeURIComponent(r.songId)}#rating-${r.ratingUserId}-${encodeSongIdForUrl(r.songId)}`,
    );
  }

  const url = ytUrlForSongId(r.songId);

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Tuned Up</Link>

      <div className="flex items-center gap-3">
        <Avatar
          imageUrl={r.imageUrl}
          name={r.displayName || r.username}
          seed={r.ratingUserId}
          size={40}
          ring={false}
        />
        <Link href={`/u/${r.username}`} className="font-medium hover:underline">
          {r.displayName || r.username}
        </Link>
        <span className="text-sm text-neutral-500">rated</span>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-5 space-y-4">
        <div className="flex items-center gap-4">
          {r.thumbnail ? (
            url ? (
              <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                <Image src={r.thumbnail} alt="" width={96} height={96} className="rounded h-24 w-24 object-cover" />
              </a>
            ) : (
              <Image src={r.thumbnail} alt="" width={96} height={96} className="rounded h-24 w-24 object-cover shrink-0" />
            )
          ) : (
            <div className="h-24 w-24 rounded bg-neutral-800 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="text-2xl font-bold truncate hover:underline">
                  {r.title}
                </a>
              ) : (
                <div className="text-2xl font-bold truncate">{r.title}</div>
              )}
              {r.kind === "album" && (
                <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                  Album
                </span>
              )}
            </div>
            <div className="text-neutral-400">{r.artist}{r.album ? ` · ${r.album}` : ""}</div>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="text-5xl font-bold tabular-nums text-emerald-400">{r.score}</span>
              <span className={`text-base font-semibold ${scoreLabel(r.score).color}`}>
                {scoreLabel(r.score).label}
              </span>
            </div>
          </div>
        </div>
        <StreamingLinks
          songId={r.songId}
          title={r.title}
          artist={r.artist}
          appleMusicUrl={r.appleMusicUrl}
          spotifyTrackId={r.spotifyTrackId}
        />
        {r.review && (
          <p className="text-neutral-200 whitespace-pre-wrap break-words">
            {renderWithMentions(r.review)}
          </p>
        )}
      </div>

      <SignedOutSharePromo username={r.username} />
      <SignedInSharePromo username={r.username} />
    </div>
  );
}

async function SignedOutSharePromo({ username }: { username: string }) {
  const { userId } = await auth();
  if (userId) return null;
  return (
    <div className="rounded-xl border border-emerald-700/40 bg-gradient-to-br from-emerald-500/10 to-sky-500/5 p-5 space-y-3 text-center">
      <div className="flex items-center justify-center gap-2 text-2xl">
        <span aria-hidden>🎵</span>
        <span className="font-bold tracking-tight">Tuned Up</span>
      </div>
      <p className="text-sm text-neutral-300">
        Rate songs 1–100, follow your friends, and see who agrees with you.
      </p>
      <div className="flex items-center justify-center gap-2 clerk-landing-primary">
        <SignUpButton forceRedirectUrl="/welcome">Get started</SignUpButton>
        <Link
          href={`/u/${username}`}
          className="rounded-full border border-neutral-700 hover:bg-neutral-900 px-5 py-2 font-medium text-sm"
        >
          See @{username}&apos;s profile
        </Link>
      </div>
    </div>
  );
}

async function SignedInSharePromo({ username }: { username: string }) {
  const { userId } = await auth();
  if (!userId) return null;
  return (
    <div className="text-center text-sm text-neutral-400">
      <Link href={`/u/${username}`} className="underline text-white">
        See more of @{username}&apos;s ratings →
      </Link>
    </div>
  );
}
