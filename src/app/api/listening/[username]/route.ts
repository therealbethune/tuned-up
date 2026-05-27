import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { canViewRatingsFrom } from "@/lib/visibility";
import { isBlockedBetween } from "@/lib/block-edges";
import {
  getAppleMusicConnection,
  readListeningHistory,
  syncAppleMusicListening,
  LISTENING_SYNC_TTL_MS,
} from "@/lib/apple-music-listening";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/listening/[username]
// Returns: {
//   provider: "apple_music" | null,
//   nowPlaying: { ...track, secondsAgo: number } | null,
//   recent: track[],
//   visibility: "followers" | "public" | "private" | null,
//   stale?: boolean,
//   error?: "not_connected" | "forbidden" | "token_rejected"
// }
//
// Privacy gating: respects the connection's `visibility` setting:
//   "public"    — anyone can see (auth still required to read API).
//   "followers" — viewer must be an accepted follower OR the owner.
//   "private"   — only the owner sees their own data.
// Also block-aware: anyone on either side of a block edge gets a 404
// posture (not_connected), same as if the user weren't connected at
// all — don't leak that a block exists.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { userId: viewerId } = await auth();
  if (!viewerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { username } = await params;
  if (!username || username.length > 64) {
    return NextResponse.json({ error: "bad_username" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id, isPrivate: users.isPrivate })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Block-aware short-circuit. Returning "not_connected" rather than
  // "forbidden" so a block doesn't leak the existence of an integration.
  if (await isBlockedBetween(viewerId, target.id)) {
    return NextResponse.json({ error: "not_connected", recent: [] });
  }

  const conn = await getAppleMusicConnection(target.id);
  if (!conn) {
    return NextResponse.json({ error: "not_connected", recent: [] });
  }

  // Visibility check — owner always passes, public passes for any
  // authed viewer, followers requires accepted-follow gate (and the
  // user's profile-level isPrivate). Private = owner-only.
  const isOwner = viewerId === target.id;
  if (!isOwner) {
    if (conn.visibility === "private") {
      return NextResponse.json({ error: "not_connected", recent: [] });
    }
    if (conn.visibility === "followers") {
      const allowed = await canViewRatingsFrom(viewerId, target.id);
      if (!allowed) {
        return NextResponse.json({ error: "not_connected", recent: [] });
      }
    }
    // "public" visibility falls through — but we still respect the
    // user's profile-level isPrivate as a defensive default. A private
    // profile should never leak listening data to non-followers even
    // if the listening visibility was set wider.
    if (target.isPrivate && conn.visibility !== "private") {
      const allowed = await canViewRatingsFrom(viewerId, target.id);
      if (!allowed) {
        return NextResponse.json({ error: "not_connected", recent: [] });
      }
    }
  }

  // Freshness check — if we haven't synced in TTL, fire the sync
  // before reading. Owners get a sync on every request; viewers get
  // the cached data so we don't burn the user's Apple quota on
  // arbitrary visitors. The sync is awaited only when the cache is
  // genuinely empty; otherwise it runs in the background and we
  // return stale-but-good data.
  const lastSynced = conn.lastSyncedAt?.getTime() ?? 0;
  const ageMs = Date.now() - lastSynced;
  const isStale = ageMs > LISTENING_SYNC_TTL_MS;

  let syncError: string | null = null;
  if (isOwner && isStale) {
    // Owner reading their own page: sync inline so they immediately
    // see fresh data after, say, listening on the way home.
    const r = await syncAppleMusicListening(target.id);
    if (!r.ok) syncError = r.error ?? "sync_failed";
  } else if (isStale) {
    // Viewer reading someone else's page: kick off the sync but
    // serve cached data immediately. The viewer's next visit will
    // see the fresh rows.
    syncAppleMusicListening(target.id).catch((e) => {
      reportError(e, "applemusic background sync");
    });
  }

  const recent = await readListeningHistory(target.id, 12);

  // "Now playing" heuristic: most recent row + played_at within 5 min
  // of now. Apple doesn't publish a real now-playing endpoint, so this
  // is the best signal we have without polling MusicKit JS on the
  // client every 30s.
  let nowPlaying: (typeof recent)[number] & { secondsAgo: number } | null = null;
  if (recent.length > 0) {
    const top = recent[0];
    const secondsAgo = Math.max(
      0,
      Math.floor((Date.now() - top.playedAt.getTime()) / 1000),
    );
    if (secondsAgo < 5 * 60) {
      nowPlaying = { ...top, secondsAgo };
    }
  }

  return NextResponse.json({
    provider: "apple_music",
    visibility: conn.visibility,
    nowPlaying,
    recent,
    stale: isStale,
    ...(syncError ? { error: syncError } : {}),
  });
}
