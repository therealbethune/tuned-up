// Server-side Spotify helpers. We only use the Client Credentials flow
// for anonymous catalog lookups (resolving a YT-Music track to a
// Spotify track id for the "Open in Spotify" deep link). No per-user
// OAuth — the user-linking flow was removed since we don't need to
// touch anyone's library or playback state.

import { eq } from "drizzle-orm";
import { db, songs } from "@/db";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

export function spotifyServerConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

// Cached in module memory so we don't ping Spotify for every search.
let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getAppAccessToken(): Promise<string> {
  if (!spotifyServerConfigured()) throw new Error("Spotify server credentials missing");
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt - 60_000) {
    return cachedAppToken.token;
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Spotify app-token failed: ${res.status} ${await res.text()}`);
  const data: { access_token: string; expires_in: number } = await res.json();
  cachedAppToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

// Strip cruft that hurts search recall: parenthetical "(feat. X)" / "(Remix)",
// trailing " - <suffix>", and noisy punctuation. Conservative — only run on
// the search query, never the stored title.
function cleanForSearch(s: string): string {
  return s
    .replace(/\s*[\(\[][^)\]]*[\)\]]/g, " ")
    .replace(/\s*[-–—]\s.*$/, "")
    .replace(/[^\w\s'&,.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// First artist only — Spotify's structured query barfs on " & " / "," / "feat".
function primaryArtist(s: string): string {
  return cleanForSearch(s)
    .split(/\s*(?:,|&|\bfeat\.?\b|\bft\.?\b|\bx\b|\bvs\.?\b)\s*/i)[0]
    .trim();
}

async function spotifySearch(token: string, query: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API}/search?type=track&limit=5&q=${encodeURIComponent(query)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const j: { tracks?: { items?: { id: string }[] } } = await res.json();
    return j.tracks?.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// Search Spotify for a track matching the given title + artist; return the
// bare track id ("4cOdK2wGLETKBW3PvgPWqT") or null if nothing matches.
// Tries progressively looser queries so featured-artist tracks still resolve.
export async function resolveSpotifyTrackId(
  title: string,
  artist: string,
): Promise<string | null> {
  if (!spotifyServerConfigured()) return null;
  const token = await getAppAccessToken();
  const cleanTitle = cleanForSearch(title);
  const cleanArtist = cleanForSearch(artist);
  const firstArtist = primaryArtist(artist);

  const queries = [
    `track:${cleanTitle} artist:${firstArtist}`,
    `${cleanTitle} ${firstArtist}`,
    `${cleanTitle} ${cleanArtist}`,
    cleanTitle,
  ];

  for (const q of queries) {
    if (!q) continue;
    const hit = await spotifySearch(token, q);
    if (hit) return hit;
  }
  return null;
}

// Cache the resolved Spotify track id on the songs row so we don't hit the
// search API on every page render. Best-effort — failures are swallowed.
export async function ensureSpotifyTrackIdCached(
  songId: string,
  title: string,
  artist: string,
): Promise<string | null> {
  try {
    const [existing] = await db
      .select({ id: songs.id, spotifyTrackId: songs.spotifyTrackId })
      .from(songs)
      .where(eq(songs.id, songId));
    if (existing?.spotifyTrackId) return existing.spotifyTrackId;
    const resolved = await resolveSpotifyTrackId(title, artist);
    if (resolved) {
      await db
        .update(songs)
        .set({ spotifyTrackId: resolved })
        .where(eq(songs.id, songId));
    }
    return resolved;
  } catch {
    return null;
  }
}
