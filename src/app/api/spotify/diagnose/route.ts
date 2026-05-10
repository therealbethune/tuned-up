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
// health, /me probe, and a sample save-track test if ?test=1.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const runSaveTest = url.searchParams.get("test") === "1";

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

  // 3) /me probe
  try {
    const me = await fetchSpotifyMe(accessToken);
    out.spotifyMe = { id: me.id, email: me.email };
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

  // 5) Optional: try a save-track call (only if ?test=1 — actually saves to library)
  if (runSaveTest) {
    try {
      // Use a stable well-known track for the test: "Bohemian Rhapsody"
      const trackId = await resolveSpotifyTrackId("Bohemian Rhapsody", "Queen");
      out.testTrackResolved = trackId;
      if (trackId) {
        const r = await fetch(
          `https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(trackId)}`,
          {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        out.testSaveStatus = r.status;
        out.testSaveOk = r.ok;
        if (!r.ok) out.testSaveBody = (await r.text()).slice(0, 200);
        // Then verify it shows as saved:
        const c = await fetch(
          `https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (c.ok) {
          const arr: boolean[] = await c.json();
          out.testSaveConfirmedInLibrary = arr[0] ?? null;
        }
      }
    } catch (e) {
      out.testError = (e as Error).message;
    }
  }

  return NextResponse.json(out, {
    headers: { "cache-control": "no-store" },
  });
}
