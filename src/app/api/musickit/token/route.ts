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
    // Browser cache 1h. The token is good for ~5 months; we sign a fresh
    // one in module memory if the cache misses. This response cache is
    // just to spare round-trips during a heavy listening session.
    return NextResponse.json(
      { token },
      { headers: { "cache-control": "private, max-age=3600" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: "sign_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
