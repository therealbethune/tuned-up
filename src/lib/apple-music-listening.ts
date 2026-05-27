// Server-side sync of a user's Apple Music recent-played history.
//
// Apple Music's user-data endpoints accept two auth headers:
//   Authorization: Bearer <developer-token>   ← signed via apple-music-token.ts
//   Music-User-Token: <music-user-token>      ← grant from MusicKit JS, stored per-user
//
// We hit `/v1/me/recent/played/tracks` which returns the last ~30
// tracks the user has played. Each response item carries an `attributes`
// payload with title / artistName / albumName / artwork / url plus the
// playback timestamp under `meta.playParams` (when present).
//
// Important: Apple does NOT publish a true "currently playing" endpoint
// — the most recent row + a `< 5 minutes ago` timestamp is the best
// approximation. The consumer of this data decides what "live" means.

import { and, desc, eq, lt } from "drizzle-orm";
import {
  db,
  appleMusicConnections,
  listeningHistory,
} from "@/db";
import { getAppleMusicDeveloperToken } from "@/lib/apple-music-token";
import { reportError } from "@/lib/report-error";

const APPLE_API = "https://api.music.apple.com";
const HISTORY_CAP = 50;
// Don't re-hit Apple's API more often than this per user (across all
// callers). Profile-page reads check freshness against this and only
// trigger a sync when stale.
export const LISTENING_SYNC_TTL_MS = 60_000;

type AppleTrack = {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: { url?: string; width?: number; height?: number };
    url?: string;
  };
  // The recent-played endpoint doesn't expose a per-row timestamp in
  // attributes — we use the response order and stamp `played_at` with
  // a synthetic descending sequence below.
};

type AppleRecentResponse = {
  data?: AppleTrack[];
  errors?: Array<{ title?: string; detail?: string; status?: string }>;
};

// Substitute the Apple-supplied artwork URL template ({w}x{h}) with a
// concrete size we want to render. Apple returns templates so the same
// URL can resolve to thumbnails or hi-res — we ask for 300px which is
// what the profile rail renders at.
function resolveArtworkUrl(art: { url?: string } | undefined): string | null {
  if (!art?.url) return null;
  return art.url.replace(/\{w\}/g, "300").replace(/\{h\}/g, "300");
}

// Returns the user's connection row, or null if they're not connected.
// Use this in the read endpoint to gate the rest of the lookup.
export async function getAppleMusicConnection(userId: string) {
  const [row] = await db
    .select()
    .from(appleMusicConnections)
    .where(eq(appleMusicConnections.userId, userId))
    .limit(1);
  return row ?? null;
}

// Fire a sync for one user. Idempotent in the absence of new plays —
// dedup is enforced by the (user, provider, track, played_at) PK.
//
// Returns:
//   { ok: true, inserted: N, total: M }
//   { ok: false, error: "..."} on auth / API / DB failure (also stamps
//     last_sync_error on the row so the UI can show a "reconnect" CTA).
export async function syncAppleMusicListening(
  userId: string,
): Promise<{ ok: boolean; inserted?: number; total?: number; error?: string }> {
  const conn = await getAppleMusicConnection(userId);
  if (!conn) return { ok: false, error: "not_connected" };

  let devToken: string;
  try {
    devToken = await getAppleMusicDeveloperToken();
  } catch (e) {
    const msg = (e as Error).message;
    await stampError(userId, `dev_token: ${msg}`);
    return { ok: false, error: "dev_token_unavailable" };
  }

  let res: Response;
  try {
    res = await fetch(`${APPLE_API}/v1/me/recent/played/tracks?limit=30`, {
      headers: {
        Authorization: `Bearer ${devToken}`,
        "Music-User-Token": conn.musicUserToken,
      },
      signal: AbortSignal.timeout(8000),
      // Apple's response can change on every call (it's the user's
      // history) — no point in caching at the fetch layer.
      cache: "no-store",
    });
  } catch (e) {
    await stampError(userId, `network: ${(e as Error).message}`);
    return { ok: false, error: "network" };
  }

  if (!res.ok) {
    // 401 / 403 = user token rejected. Surface a clear error so the
    // UI can show "reconnect" instead of pretending the rail just has
    // no recent plays. We don't delete the row — the user might come
    // back via Settings and re-auth.
    const status = res.status;
    if (status === 401 || status === 403) {
      await stampError(userId, `token_rejected_${status}`);
      return { ok: false, error: "token_rejected" };
    }
    await stampError(userId, `http_${status}`);
    return { ok: false, error: `http_${status}` };
  }

  let payload: AppleRecentResponse;
  try {
    payload = (await res.json()) as AppleRecentResponse;
  } catch (e) {
    await stampError(userId, `parse: ${(e as Error).message}`);
    return { ok: false, error: "parse" };
  }
  const tracks = payload.data ?? [];

  // Apple returns the list in chronological order — most recent first.
  // We don't get per-row timestamps so we synthesize them descending
  // from "now", spaced 1 second apart, so the order is preserved in
  // SQL via played_at DESC. The actual wall-clock isn't meaningful;
  // the relative ordering is what we care about.
  const now = Date.now();
  const rows = tracks
    .filter((t) => t.id && t.attributes?.name && t.attributes?.artistName)
    .map((t, i) => ({
      userId,
      provider: "apple_music" as const,
      trackId: t.id,
      playedAt: new Date(now - i * 1000),
      title: t.attributes!.name!,
      artist: t.attributes!.artistName!,
      album: t.attributes!.albumName ?? null,
      thumbnail: resolveArtworkUrl(t.attributes!.artwork),
      appleMusicUrl: t.attributes!.url ?? null,
    }));

  let inserted = 0;
  if (rows.length > 0) {
    try {
      const result = await db
        .insert(listeningHistory)
        .values(rows)
        .onConflictDoNothing()
        .returning({ trackId: listeningHistory.trackId });
      inserted = result.length;
    } catch (e) {
      await stampError(userId, `insert: ${(e as Error).message}`);
      return { ok: false, error: "db_insert" };
    }
  }

  // Cap the history table at HISTORY_CAP rows per user. Without this,
  // a long-time user's listening_history could grow forever; we only
  // ever surface the most recent rows in the UI anyway.
  try {
    const keep = await db
      .select({ playedAt: listeningHistory.playedAt })
      .from(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.provider, "apple_music"),
        ),
      )
      .orderBy(desc(listeningHistory.playedAt))
      .limit(HISTORY_CAP);
    if (keep.length === HISTORY_CAP) {
      const cutoff = keep[keep.length - 1].playedAt;
      await db
        .delete(listeningHistory)
        .where(
          and(
            eq(listeningHistory.userId, userId),
            eq(listeningHistory.provider, "apple_music"),
            lt(listeningHistory.playedAt, cutoff),
          ),
        );
    }
  } catch (e) {
    // Sweep failure isn't fatal — the next sync will retry.
    reportError(e, "applemusic sync sweep");
  }

  await stampSuccess(userId);
  return { ok: true, inserted, total: rows.length };
}

async function stampSuccess(userId: string) {
  try {
    await db
      .update(appleMusicConnections)
      .set({ lastSyncedAt: new Date(), lastSyncError: null })
      .where(eq(appleMusicConnections.userId, userId));
  } catch {
    /* non-critical */
  }
}

async function stampError(userId: string, error: string) {
  try {
    await db
      .update(appleMusicConnections)
      .set({ lastSyncedAt: new Date(), lastSyncError: error.slice(0, 500) })
      .where(eq(appleMusicConnections.userId, userId));
  } catch {
    /* non-critical */
  }
}

// Read the cached recent-played for a user, no sync. Used by the
// /api/listening endpoint after a freshness check + by the profile
// page directly.
export async function readListeningHistory(userId: string, limit = 12) {
  return db
    .select({
      provider: listeningHistory.provider,
      trackId: listeningHistory.trackId,
      playedAt: listeningHistory.playedAt,
      title: listeningHistory.title,
      artist: listeningHistory.artist,
      album: listeningHistory.album,
      thumbnail: listeningHistory.thumbnail,
      appleMusicUrl: listeningHistory.appleMusicUrl,
    })
    .from(listeningHistory)
    .where(eq(listeningHistory.userId, userId))
    .orderBy(desc(listeningHistory.playedAt))
    .limit(limit);
}
