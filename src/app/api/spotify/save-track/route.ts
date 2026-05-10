import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs, spotifyAccounts } from "@/db";
import {
  ensureSpotifyTrackIdCached,
  saveTrackToLibrary,
} from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/spotify/save-track  body: { songId }
// Resolves the song to a Spotify track id (caching the result on the songs
// row) and saves it to the user's "Liked Songs" library. Requires the user
// to have linked their Spotify account first.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Make sure the account is linked before doing any work.
  const [account] = await db
    .select({ id: spotifyAccounts.userId })
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId));
  if (!account) {
    return NextResponse.json({ error: "spotify_not_linked" }, { status: 412 });
  }

  const { songId } = (await req.json().catch(() => ({}))) ?? {};
  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });

  // If the songId is already a spotify-prefixed id, use it directly.
  let trackId: string | null = null;
  if (typeof songId === "string" && songId.startsWith("spotify:")) {
    trackId = songId.slice("spotify:".length);
  } else {
    const [s] = await db
      .select({
        title: songs.title,
        artist: songs.artist,
        spotifyTrackId: songs.spotifyTrackId,
      })
      .from(songs)
      .where(eq(songs.id, songId));
    if (!s) return NextResponse.json({ error: "song not found" }, { status: 404 });
    trackId = s.spotifyTrackId ?? (await ensureSpotifyTrackIdCached(songId, s.title, s.artist));
  }

  if (!trackId) {
    return NextResponse.json({ error: "no_match_on_spotify" }, { status: 404 });
  }

  try {
    await saveTrackToLibrary(userId, trackId);
    return NextResponse.json({ ok: true, spotifyTrackId: trackId });
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    return NextResponse.json(
      {
        error: err.code || "save_failed",
        message: err.message,
        spotifyStatus: err.status ?? null,
      },
      { status: err.status === 401 || err.status === 403 ? err.status : 502 },
    );
  }
}
