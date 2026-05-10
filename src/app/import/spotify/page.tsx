import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { db, ratings, spotifyAccounts } from "@/db";
import { fetchUserTopTracks } from "@/lib/spotify-server";
import { SpotifyIconOnGreen } from "@/components/icons";
import { BatchRateClient } from "./BatchRateClient";

export const dynamic = "force-dynamic";

type Range = "short_term" | "medium_term" | "long_term";

export default async function SpotifyImportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Is the user's Spotify connected server-side? If not, render a
  // connect-prompt instead of a redirect — keeps the back nav intuitive
  // and lets them read what the page does before authenticating.
  const [link] = await db
    .select({ userId: spotifyAccounts.userId })
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId))
    .limit(1);

  if (!link) {
    return (
      <div className="space-y-6">
        <Link href="/feed" className="text-sm text-neutral-400 hover:text-white">← Feed</Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Import from Spotify</h1>
          <p className="text-neutral-400">
            Pull your top tracks from Spotify and rate the whole batch in seconds.
          </p>
        </div>
        <a
          href="/api/spotify/connect?return=/import/spotify"
          className="inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 py-2.5 active:scale-95"
        >
          <SpotifyIconOnGreen size={18} />
          Connect Spotify
        </a>
        <p className="text-xs text-neutral-500 max-w-prose">
          We only request read access to your top tracks and the ability to save tracks to your library. We never post on your behalf, and you can disconnect anytime from Settings.
        </p>
      </div>
    );
  }

  const sp = await searchParams;
  const rawRange = sp.range;
  const range: Range =
    rawRange === "short_term" || rawRange === "long_term"
      ? rawRange
      : "medium_term";

  // Fetch up to 50 top tracks, then load MY existing ratings on those
  // tracks. Showing existing scores prevents re-rating the same songs
  // and gives a nice "already rated" state.
  const tracks = await fetchUserTopTracks(userId, range, 50);
  const songIds = tracks.map((t) => `spotify:${t.id}`);
  const myRatings = songIds.length === 0
    ? []
    : await db
        .select({ songId: ratings.songId, score: ratings.score })
        .from(ratings)
        .where(and(eq(ratings.userId, userId), inArray(ratings.songId, songIds)));

  // Build a {bareSpotifyId -> score} map for the client. The client
  // tracks tracks by bare Spotify id; the DB stores them prefixed.
  const existingScores: Record<string, number> = {};
  for (const r of myRatings) {
    if (r.songId.startsWith("spotify:")) {
      existingScores[r.songId.slice("spotify:".length)] = r.score;
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <Link href="/feed" className="text-sm text-neutral-400 hover:text-white">← Feed</Link>
        <h1 className="text-2xl font-bold mt-1">Quick-rate your top tracks</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Tap a vibe to save a rating. Each tap is one-and-done — no review needed.
        </p>
      </div>
      <BatchRateClient
        key={range}
        tracks={tracks}
        existingScores={existingScores}
        range={range}
      />
    </div>
  );
}
