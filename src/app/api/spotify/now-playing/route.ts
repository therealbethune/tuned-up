import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchUserNowPlaying } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/now-playing
// Returns the viewer's currently-playing track, or { playing: null } when
// nothing is playing / Spotify not linked / required scope missing.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ playing: null });

  const playing = await fetchUserNowPlaying(userId);
  return NextResponse.json({ playing });
}
