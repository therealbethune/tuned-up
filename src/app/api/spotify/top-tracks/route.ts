import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchUserTopTracks } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/top-tracks?range=short_term|medium_term|long_term
// Returns the viewer's top tracks (up to 10) from Spotify. Empty array
// if not linked / token expired / scope missing.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ tracks: [] });

  const url = new URL(req.url);
  const rawRange = url.searchParams.get("range");
  const range: "short_term" | "medium_term" | "long_term" =
    rawRange === "medium_term" || rawRange === "long_term"
      ? rawRange
      : "short_term";

  const tracks = await fetchUserTopTracks(userId, range, 10);
  return NextResponse.json({ tracks, range });
}
