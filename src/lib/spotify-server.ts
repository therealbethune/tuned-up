// Server-side Spotify helpers. Uses the Authorization Code flow (with the
// client secret) for persistent per-user account linking, plus the Client
// Credentials flow for unauthenticated app-level lookups (e.g. resolving a
// YT-Music track to a Spotify track id for the "Open in Spotify" link).

import { eq } from "drizzle-orm";
import { db, spotifyAccounts, songs } from "@/db";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";

const CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";

// Scopes needed for: importing top tracks, reading saved songs, saving
// new tracks to the user's library, reading what's currently playing
// for the "now listening" widget, AND user-read-private so /me returns
// the product field (premium vs free) — important for diagnosing
// dev-mode 403s which require Premium for the app owner.
export const SPOTIFY_LINK_SCOPES = [
  "user-top-read",
  "user-library-read",
  "user-library-modify",
  "user-read-email",
  "user-read-private",
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

export function spotifyServerConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

function basicAuthHeader(): string {
  return "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

// --- Client Credentials flow (app-level, no user) --------------------------
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

// --- Authorization Code flow (per-user) ------------------------------------

export type LinkedSpotifyAccount = {
  userId: string;
  spotifyUserId: string;
  scope: string;
  connectedAt: Date;
};

export async function exchangeCodeForUserTokens(
  code: string,
  redirectUri: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Spotify code-exchange failed: ${res.status} ${await res.text()}`);
  const j: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  } = await res.json();
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresIn: j.expires_in,
    scope: j.scope,
  };
}

async function refreshUserAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
  // Spotify rotates refresh tokens occasionally — if a new one comes back,
  // persist it; otherwise keep the old one.
  newRefreshToken: string | null;
}> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Spotify refresh failed: ${res.status} ${await res.text()}`);
  const j: { access_token: string; expires_in: number; refresh_token?: string } = await res.json();
  return {
    accessToken: j.access_token,
    expiresIn: j.expires_in,
    newRefreshToken: j.refresh_token ?? null,
  };
}

// Returns a valid access token for a user, refreshing if expired. null if the
// user hasn't linked their Spotify account.
export async function getUserAccessToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId));
  if (!row) return null;

  // 60s safety buffer.
  const stillValid = row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000;
  if (stillValid && row.accessToken) return row.accessToken;

  const refreshed = await refreshUserAccessToken(row.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expiresIn * 1000);
  await db
    .update(spotifyAccounts)
    .set({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.newRefreshToken ?? row.refreshToken,
      expiresAt,
    })
    .where(eq(spotifyAccounts.userId, userId));
  return refreshed.accessToken;
}

export async function fetchSpotifyMe(accessToken: string): Promise<{
  id: string;
  email?: string;
  display_name?: string;
  country?: string;
  product?: string;
}> {
  const res = await fetch(`${API}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Spotify /me failed: ${res.status}`);
  return res.json();
}

// --- Personal listening data (per-user) ------------------------------------

export type SpotifyTopTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  previewUrl: string | null;
  externalUrl: string;
  durationMs: number;
};

export async function fetchUserTopTracks(
  userId: string,
  range: "short_term" | "medium_term" | "long_term" = "short_term",
  limit = 10,
): Promise<SpotifyTopTrack[]> {
  const token = await getUserAccessToken(userId);
  if (!token) return [];
  const res = await fetch(
    `${API}/me/top/tracks?limit=${limit}&time_range=${range}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) return [];
  const j: {
    items?: Array<{
      id: string;
      name: string;
      artists: { name: string }[];
      album: { name: string; images: { url: string }[] };
      preview_url: string | null;
      external_urls: { spotify: string };
      duration_ms: number;
    }>;
  } = await res.json();
  return (j.items ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album.name,
    image: t.album.images?.[0]?.url ?? null,
    previewUrl: t.preview_url,
    externalUrl: t.external_urls.spotify,
    durationMs: t.duration_ms,
  }));
}

export type SpotifyNowPlaying = {
  isPlaying: boolean;
  trackId: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  externalUrl: string;
  progressMs: number;
  durationMs: number;
};

// Returns the user's currently-playing track, or null if nothing is
// playing / scope not granted / 204 No Content. Best-effort — silently
// returns null on any error so the profile widget gracefully hides.
export async function fetchUserNowPlaying(
  userId: string,
): Promise<SpotifyNowPlaying | null> {
  const token = await getUserAccessToken(userId);
  if (!token) return null;
  try {
    const res = await fetch(`${API}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    // 204 = nothing playing. 403 = scope missing (user-read-currently-playing
    // isn't in our requested set yet — fail open).
    if (res.status !== 200) return null;
    const j: {
      is_playing: boolean;
      progress_ms: number;
      item?: {
        id: string;
        name: string;
        artists: { name: string }[];
        album: { name: string; images: { url: string }[] };
        external_urls: { spotify: string };
        duration_ms: number;
      };
    } = await res.json();
    if (!j.item) return null;
    return {
      isPlaying: j.is_playing,
      trackId: j.item.id,
      name: j.item.name,
      artists: j.item.artists.map((a) => a.name),
      album: j.item.album.name,
      image: j.item.album.images?.[0]?.url ?? null,
      externalUrl: j.item.external_urls.spotify,
      progressMs: j.progress_ms,
      durationMs: j.item.duration_ms,
    };
  } catch {
    return null;
  }
}

// Quick health check used by the profile UI to surface "Spotify connection
// looks expired — reconnect" messages instead of a silent empty state.
export async function pingUserSpotify(userId: string): Promise<
  | { ok: true; spotifyUserId: string }
  | { ok: false; reason: "not_linked" | "token_failed" | "api_failed" }
> {
  try {
    const token = await getUserAccessToken(userId);
    if (!token) return { ok: false, reason: "not_linked" };
    const me = await fetchSpotifyMe(token);
    return { ok: true, spotifyUserId: me.id };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("refresh failed")) return { ok: false, reason: "token_failed" };
    return { ok: false, reason: "api_failed" };
  }
}

// --- Track resolution (app-level, no user token needed) --------------------

// Strip cruft that hurts search recall: parenthetical "(feat. X)" / "(Remix)",
// trailing " - <suffix>", and noisy punctuation. Keep it conservative — we
// only run it on the search query, not the stored title.
function cleanForSearch(s: string): string {
  return s
    .replace(/\s*[\(\[][^)\]]*[\)\]]/g, " ") // remove "(...)" / "[...]"
    .replace(/\s*[-–—]\s.*$/, "") // drop "- Single Version" etc.
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
    // Network errors / timeouts — gracefully return null so the resolver
    // tries the next progressively-looser query.
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
    cleanTitle, // last-ditch
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

// --- Library mutations -----------------------------------------------------

export async function saveTrackToLibrary(userId: string, spotifyTrackId: string): Promise<void> {
  const token = await getUserAccessToken(userId);
  if (!token) {
    const e = new Error("not_linked");
    (e as Error & { code?: string }).code = "not_linked";
    throw e;
  }
  const res = await fetch(`${API}/me/tracks?ids=${encodeURIComponent(spotifyTrackId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Spotify ${res.status}: ${body.slice(0, 140)}`) as Error & {
      code?: string;
      status?: number;
    };
    err.status = res.status;
    if (res.status === 401) err.code = "token_expired";
    else if (res.status === 403) err.code = "missing_scope";
    else if (res.status === 429) err.code = "rate_limited";
    else err.code = "spotify_error";
    throw err;
  }
}

// Returns whether the user already has each given track id saved. Useful for
// rendering filled vs. empty heart on the SaveToSpotify button.
export async function checkTracksSaved(
  userId: string,
  spotifyTrackIds: string[],
): Promise<Record<string, boolean>> {
  if (spotifyTrackIds.length === 0) return {};
  const token = await getUserAccessToken(userId);
  if (!token) return {};
  const res = await fetch(
    `${API}/me/tracks/contains?ids=${spotifyTrackIds.map(encodeURIComponent).join(",")}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) return {};
  const arr: boolean[] = await res.json();
  const out: Record<string, boolean> = {};
  spotifyTrackIds.forEach((id, i) => (out[id] = !!arr[i]));
  return out;
}
