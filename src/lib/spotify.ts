// Spotify Web API helpers. Uses PKCE (no client secret required) so the
// whole OAuth flow runs client-side. Configure via NEXT_PUBLIC_SPOTIFY_CLIENT_ID.

import type { SongResult } from "@/lib/ytmusic";

export const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SCOPES = ["user-top-read", "user-library-read"].join(" ");

const VERIFIER_KEY = "tu_spotify_pkce_verifier";
const TOKEN_KEY = "tu_spotify_access_token";
const TOKEN_EXPIRES_KEY = "tu_spotify_token_expires_at";

// Generate a cryptographically random PKCE code verifier (43-128 chars, allowed
// charset). 64 bytes → ~86 base64url chars.
function randomVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(buf: Uint8Array | ArrayBuffer): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

export function isSpotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.length > 0;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TOKEN_KEY);
  const exp = Number(sessionStorage.getItem(TOKEN_EXPIRES_KEY) ?? 0);
  if (!t || Date.now() > exp) return null;
  return t;
}

export function clearStoredToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRES_KEY);
}

export async function startSpotifyAuth(redirectUri: string): Promise<void> {
  if (!isSpotifyConfigured()) throw new Error("Spotify is not configured");
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = base64UrlEncode(await sha256(verifier));
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.href = `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Missing PKCE verifier — start the auth flow again.");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data: { access_token: string; expires_in: number } = await res.json();
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.setItem(TOKEN_KEY, data.access_token);
  // Subtract 60s buffer so we don't use a token at the moment it expires.
  sessionStorage.setItem(
    TOKEN_EXPIRES_KEY,
    String(Date.now() + (data.expires_in - 60) * 1000),
  );
  return data.access_token;
}

type SpotifyTrack = {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string }[] };
  duration_ms: number;
};

export async function fetchTopTracks(
  token: string,
  range: "short_term" | "medium_term" | "long_term" = "medium_term",
  limit = 50,
): Promise<SongResult[]> {
  const res = await fetch(
    `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${range}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Spotify top tracks failed: ${res.status}`);
  const data: { items: SpotifyTrack[] } = await res.json();
  return data.items.map(spotifyTrackToSong);
}

function spotifyTrackToSong(t: SpotifyTrack): SongResult {
  return {
    id: `spotify:${t.id}`,
    kind: "song",
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
    album: t.album.name || null,
    thumbnail: t.album.images?.[0]?.url ?? null,
    durationSeconds: Math.round(t.duration_ms / 1000),
  };
}
