import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  appleMusicConfigured,
  getAppleMusicDeveloperToken,
} from "@/lib/apple-music-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/musickit/token — returns a freshly-signed (or cached) developer
// token for MusicKit JS. Auth-required so we don't hand out tokens to
// anonymous scrapers, even though the token itself is bearer-style and
// not user-specific.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!appleMusicConfigured()) {
    return NextResponse.json(
      { error: "apple_music_not_configured" },
      { status: 503 },
    );
  }

  try {
    const token = await getAppleMusicDeveloperToken();
    // Do NOT cache on the browser. The token itself lasts months and is
    // signed in-memory on the server, but we want the auth gate on this
    // route to run on every request — caching meant a logged-out user
    // could keep using the cached token for an hour after sign-out.
    return NextResponse.json(
      { token },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "sign_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
