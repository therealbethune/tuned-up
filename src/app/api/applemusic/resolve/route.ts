import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs } from "@/db";
import { resolveAppleMusicTrackId } from "@/lib/apple-music";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/applemusic/resolve?songId=<id>
// Returns { trackId: <Apple Music catalog id> } so the client can pass it
// to MusicKit's addToLibrary. We don't cache here since iTunes Search is
// fast and the catalog ID isn't worth a schema column right now (we
// already cache appleMusicUrl on the songs row for the "Open in" link).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const songId = url.searchParams.get("songId");
  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });

  const [s] = await db
    .select({ title: songs.title, artist: songs.artist, kind: songs.kind })
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  if (!s) return NextResponse.json({ error: "song not found" }, { status: 404 });

  const trackId = await resolveAppleMusicTrackId({
    title: s.title,
    artist: s.artist,
    kind: s.kind === "album" ? "album" : "song",
  });
  if (!trackId) return NextResponse.json({ error: "no_match" }, { status: 404 });

  return NextResponse.json({ trackId });
}
