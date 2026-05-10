import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { fetchUserTopTracks } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/top-tracks?range=short_term|medium_term|long_term&limit=NN
// Returns the viewer's top tracks from Spotify. Empty array if not
// linked / token expired / scope missing. `limit` defaults to 10 (used
// by the profile widget); the bulk-import flow passes limit=50 (the
// Spotify API cap).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ tracks: [] });

  const url = new URL(req.url);
  const rawRange = url.searchParams.get("range");
  const range: "short_term" | "medium_term" | "long_term" =
    rawRange === "medium_term" || rawRange === "long_term"
      ? rawRange
      : "short_term";
  const rawLimit = Number(url.searchParams.get("limit") ?? "10");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(50, Math.max(1, Math.round(rawLimit)))
    : 10;

  const tracks = await fetchUserTopTracks(userId, range, limit);
  return NextResponse.json({ tracks, range });
}
