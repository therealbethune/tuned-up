import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, spotifyAccounts } from "@/db";
import {
  fetchSpotifyMe,
  getUserAccessToken,
  spotifyServerConfigured,
  resolveSpotifyTrackId,
} from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authenticated diagnostic page for debugging the Spotify save flow.
// Hit /api/spotify/diagnose while signed in to see exactly what's broken.
// Returns: server-config status, account-link state, scope check, token
// health, and a /me probe. (A ?test=1 branch used to PUT a known track
// into the signed-in user's library — removed because it was a footgun:
// hitting the URL silently mutated the caller's Spotify library.)
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

  // 1) DB row check
  const [row] = await db
    .select()
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId))
    .limit(1);
  out.linked = Boolean(row);
  if (row) {
    out.spotifyUserId = row.spotifyUserId;
    out.scopeStored = row.scope;
    out.scopeIncludesLibraryModify = row.scope.includes("user-library-modify");
    out.scopeIncludesNowPlaying = row.scope.includes("user-read-currently-playing");
    out.tokenExpiresAt = row.expiresAt;
    out.connectedAt = row.connectedAt;
  }

  // 2) Token health
  try {
    const token = await getUserAccessToken(userId);
    out.tokenObtained = Boolean(token);
  } catch (e) {
    out.tokenObtained = false;
    out.tokenError = (e as Error).message;
    return NextResponse.json(out);
  }
  const accessToken = await getUserAccessToken(userId);
  if (!accessToken) return NextResponse.json(out);

  // 3) /me probe — pull all the fields Spotify's User Management form
  // wants to match against (name + email). 403s on PUT /me/tracks in
  // dev mode are usually because the User Management entry's name
  // doesn't match this exact display_name string.
  try {
    const me = await fetchSpotifyMe(accessToken);
    out.spotifyMe = {
      id: me.id,
      email: me.email,
      display_name: me.display_name,
      country: me.country,
      product: me.product,
    };
  } catch (e) {
    out.spotifyMeError = (e as Error).message;
  }

  // 4) Resolve a known song to verify search works
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
