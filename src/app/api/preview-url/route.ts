import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs } from "@/db";

export const runtime = "nodejs";

// GET /api/preview-url?songId=<id>
// Returns { previewUrl: string | null }
//
// Tries the iTunes Search API (no auth needed; same lookup we use for
// Apple Music URLs). iTunes responses include a `previewUrl` (~30s
// audio). Falls back to null if no match — UI then hides the play button.
//
// Caching:
//  - The iTunes lookup itself is cached at the Next.js data-cache layer
//    (revalidate: 1 day). Preview URLs are stable; iTunes also rate-
//    limits aggressively, so collapsing duplicate lookups across users
//    is a meaningful win for popular songs.
//  - The HTTP response is sent with s-maxage so the platform's edge
//    cache (Netlify) can serve repeat hits without invoking the
//    function. We mark it `public` because the body is the same for
//    every signed-in user — `?songId` is the only thing that varies it.
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
        // Day-long fetch cache so repeated lookups for the same song
        // hit the local cache instead of iTunes.
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return NextResponse.json({ previewUrl: null });
    const data: { results?: Array<{ previewUrl?: string }> } = await res.json();
    const previewUrl = data.results?.[0]?.previewUrl ?? null;
    return NextResponse.json(
      { previewUrl },
      {
        headers: {
          // Browser cache 1h. CDN cache 1d with 1d stale-while-revalidate
          // — preview URLs don't change once iTunes returns them, so the
          // edge can serve subsequent requests for the same songId with
          // no function invocation.
          "cache-control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json({ previewUrl: null });
  }
}
