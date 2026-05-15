import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs } from "@/db";

export const runtime = "nodejs";

// GET /api/preview-url?songId=<id>
// Returns { previewUrl: string | null, title?: string, artist?: string,
//           album?: string | null, thumbnail?: string | null }
//
// Tries the iTunes Search API (no auth needed; same lookup we use for
// Apple Music URLs). iTunes responses include a `previewUrl` (~30s
// audio). Falls back to null if no match — UI then hides the play button.
//
// Also returns the song's stored title/artist/album/thumbnail so the
// client can populate `navigator.mediaSession.metadata` — that's what
// makes iOS Control Center / lock-screen "Now Playing" show the song
// (otherwise iOS shows a generic "Web Page Audio" entry, which users
// confuse with the audio not playing at all).
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
    .select({
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      thumbnail: songs.thumbnail,
      kind: songs.kind,
    })
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  if (!s) return NextResponse.json({ previewUrl: null });

  if (s.kind === "album") {
    return NextResponse.json({
      previewUrl: null,
      title: s.title,
      artist: s.artist,
      album: s.album,
      thumbnail: s.thumbnail,
    });
  }

  // For artist strings like "Jack Johnson, Eddie Vedder & Kawika Kahiapo"
  // iTunes' single-line search often fails to match the precise track —
  // it returns whatever song happens to share the title. To avoid playing
  // the wrong track, search with title+artist AND validate that one of
  // the candidate results actually mentions the queried primary artist.
  //
  // We fetch up to 5 candidates and pick the first whose artistName
  // shares a substring with the parent-supplied artist (case-insensitive).
  // Fallback: if nothing matches, return null instead of guessing — UI
  // hides the play button rather than silently playing a different song.
  const primaryArtist = s.artist.split(/[,&/]| feat\.?| ft\.?| with /i)[0]?.trim() || s.artist;
  const term = `${s.title} ${primaryArtist}`.trim();
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`,
      {
        headers: { "user-agent": "TunedUp/1.0 (https://tuned-up.com)" },
        signal: AbortSignal.timeout(5000),
        // Day-long fetch cache so repeated lookups for the same song
        // hit the local cache instead of iTunes.
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) {
      return NextResponse.json({
        previewUrl: null,
        title: s.title,
        artist: s.artist,
        album: s.album,
        thumbnail: s.thumbnail,
      });
    }
    const data: {
      results?: Array<{ previewUrl?: string; artistName?: string; trackName?: string }>;
    } = await res.json();
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const primaryArtistLower = norm(primaryArtist);
    const candidates = data.results ?? [];
    const matched =
      candidates.find((r) => {
        const a = norm(r.artistName ?? "");
        // Either the iTunes artist contains our primary artist or vice
        // versa (handles "Jack Johnson" vs "Jack Johnson, Eddie Vedder &
        // Kawika Kahiapo" — both directions accepted).
        return a && (a.includes(primaryArtistLower) || primaryArtistLower.includes(a));
      }) ?? null;
    const previewUrl = matched?.previewUrl ?? null;
    return NextResponse.json(
      {
        previewUrl,
        title: s.title,
        artist: s.artist,
        album: s.album,
        thumbnail: s.thumbnail,
      },
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
    return NextResponse.json({
      previewUrl: null,
      title: s.title,
      artist: s.artist,
      album: s.album,
      thumbnail: s.thumbnail,
    });
  }
}
