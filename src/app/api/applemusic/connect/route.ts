import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, appleMusicConnections } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { reportError } from "@/lib/report-error";
import { syncAppleMusicListening } from "@/lib/apple-music-listening";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/applemusic/connect
// Body: { musicUserToken: string, storefront?: string, visibility?: "followers" | "public" | "private" }
//
// MusicKit JS authorizes the user client-side. The browser pulls the
// Music User Token from `music.musicUserToken` and POSTs it here.
// We upsert it onto apple_music_connections + kick off an initial
// listening sync so the user's recent plays show up on their profile
// immediately after connect (no "Why is this empty?" pause).
//
// Token security: this column is sensitive — same trust level as an
// OAuth refresh token. Future hardening would encrypt at rest with
// a KMS key. For v1 it lives in plain text alongside the rest of the
// user's profile data, behind the same DB credentials.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const musicUserToken = typeof b.musicUserToken === "string" ? b.musicUserToken : "";
  // MusicKit user tokens are long base64-ish strings. Reject anything
  // implausibly short (would mean the client sent a stale/cleared
  // token) or insanely long (probably garbage / attack).
  if (musicUserToken.length < 40 || musicUserToken.length > 4096) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 });
  }

  const storefront =
    typeof b.storefront === "string" && b.storefront.length > 0 && b.storefront.length <= 8
      ? b.storefront
      : null;

  const visibility =
    b.visibility === "public" || b.visibility === "private"
      ? b.visibility
      : "followers";

  try {
    await db
      .insert(appleMusicConnections)
      .values({
        userId,
        musicUserToken,
        storefront,
        visibility,
      })
      .onConflictDoUpdate({
        target: appleMusicConnections.userId,
        set: {
          musicUserToken,
          storefront,
          visibility,
          // Re-stamp connectedAt only if this is a NEW connect, not a
          // pure visibility toggle. Use COALESCE on the existing value
          // via a separate UPDATE below if we wanted strict semantics;
          // for now treat any POST as "freshly connected" since the
          // client already had to re-grant MusicKit access.
          connectedAt: new Date(),
          // Clear any stale sync error from a previous broken token.
          lastSyncError: null,
        },
      });
  } catch (e) {
    reportError(e, "applemusic connect upsert");
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Fire-and-forget initial sync so the user sees their recent plays
  // immediately after connecting. Failures are surfaced via
  // lastSyncError on the connection row (not as an HTTP error here —
  // the connect itself succeeded).
  syncAppleMusicListening(userId).catch((e) => {
    reportError(e, "applemusic connect initial sync");
  });

  return NextResponse.json({ ok: true, visibility });
}

// PATCH /api/applemusic/connect
// Body: { visibility: "followers" | "public" | "private" }
//
// Pure visibility toggle — doesn't require re-presenting a token. Used
// by the settings UI to flip privacy without making the user re-auth.
export async function PATCH(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) ?? {};
  const visibility = body.visibility;
  if (visibility !== "followers" && visibility !== "public" && visibility !== "private") {
    return NextResponse.json({ error: "bad_visibility" }, { status: 400 });
  }

  try {
    const updated = await db
      .update(appleMusicConnections)
      .set({ visibility })
      .where(eq(appleMusicConnections.userId, userId))
      .returning({ userId: appleMusicConnections.userId });
    if (updated.length === 0) {
      return NextResponse.json({ error: "not_connected" }, { status: 404 });
    }
  } catch (e) {
    reportError(e, "applemusic connect visibility patch");
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, visibility });
}
