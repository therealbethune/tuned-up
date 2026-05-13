import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  spotifyServerConfigured,
  resolveSpotifyTrackId,
  getAppAccessToken,
} from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated diagnostic for the Spotify client-credentials flow we
// use to resolve track ids for "Open in Spotify" deep links. Hit
// /api/spotify/diagnose while signed in to verify env vars + the
// search API are healthy.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const out: Record<string, unknown> = {
    serverConfigured: spotifyServerConfigured(),
    env: {
      NEXT_PUBLIC_SPOTIFY_CLIENT_ID: Boolean(process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID),
      SPOTIFY_CLIENT_SECRET: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
    },
  };

  // Client-credentials token check.
  try {
    const token = await getAppAccessToken();
    out.appTokenObtained = Boolean(token);
  } catch (e) {
    out.appTokenObtained = false;
    out.appTokenError = (e as Error).message;
    return NextResponse.json(out);
  }

  // Resolve a known song to verify the search API is reachable.
  try {
    const resolved = await resolveSpotifyTrackId("Active", "Asake");
    out.resolverTest = { query: "Active by Asake", trackId: resolved };
  } catch (e) {
    out.resolverError = (e as Error).message;
  }

  return NextResponse.json(out, {
    headers: { "cache-control": "no-store" },
  });
}
