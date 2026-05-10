import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/preview-url?songId=<id>
// Returns { previewUrl: string | null }
//
// First tries the iTunes Search API (no auth needed; same lookup we use
// for Apple Music URLs). iTunes responses include a `previewUrl` (~30s
// audio). Falls back to null if no match — UI then hides the play button.
//
// We don't cache on the songs table yet (one extra schema column is on
// the roadmap; for now we re-resolve each click, which is fine because
// each user only triggers a few of these per session).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const songId = url.searchParams.get("songId");
  if (!songId || typeof songId !== "string" || songId.length > 256) {
    return NextResponse.json({ error: "invalid songId" }, { status: 400 });
  }

  const [s] = await db
    .select({ title: songs.title, artist: songs.artist, kind: songs.kind })
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  if (!s) return NextResponse.json({ previewUrl: null });

  if (s.kind === "album") return NextResponse.json({ previewUrl: null });

  const term = `${s.title} ${s.artist}`.trim();
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?media=music&entity=song&limit=1&term=${encodeURIComponent(term)}`,
      {
        headers: { "user-agent": "TunedUp/1.0 (https://tuned-up.com)" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return NextResponse.json({ previewUrl: null });
    const data: { results?: Array<{ previewUrl?: string }> } = await res.json();
    const previewUrl = data.results?.[0]?.previewUrl ?? null;
    return NextResponse.json(
      { previewUrl },
      // Browser cache 1h — preview URLs don't change once iTunes returns them.
      { headers: { "cache-control": "private, max-age=3600" } },
    );
  } catch {
    return NextResponse.json({ previewUrl: null });
  }
}
