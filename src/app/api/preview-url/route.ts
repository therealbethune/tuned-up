import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, songs } from "@/db";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";

// GET /api/preview-url?songId=<id>
// Returns { previewUrl: string | null, title?, artist?, album?, thumbnail? }
//
// Two-tier cache:
//   1. songs.preview_url + songs.preview_checked — once we've looked up
//      a song from iTunes, the result lives on the row forever. Pages
//      that render <AudioPreviewButton> include preview_url in the same
//      query, so the click handler runs SYNCHRONOUSLY with the URL in
//      hand. That's the design that lets iOS Safari grant gesture
//      activation reliably; we don't even need the fetch in 99% of taps.
//   2. iTunes Search itself is still cached at Next's data layer
//      (revalidate: 1 day) so the warm path is cheap on first
//      population too.
//
// `preview_checked` lets us distinguish "never looked up" from "iTunes
// has no preview for this song." We never re-hit iTunes for the second
// case — the song just doesn't get a preview button.
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
      previewUrl: songs.previewUrl,
      previewChecked: songs.previewChecked,
    })
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  if (!s) return NextResponse.json({ previewUrl: null });

  // Albums never have previews — short-circuit before iTunes.
  if (s.kind === "album") {
    return NextResponse.json({
      previewUrl: null,
      title: s.title,
      artist: s.artist,
      album: s.album,
      thumbnail: s.thumbnail,
    });
  }

  // FAST PATH: row is already populated. Return whatever the DB has —
  // either a real URL or null (meaning iTunes had no match). Avoids
  // hitting iTunes at all.
  if (s.previewChecked) {
    return NextResponse.json(
      {
        previewUrl: s.previewUrl,
        title: s.title,
        artist: s.artist,
        album: s.album,
        thumbnail: s.thumbnail,
      },
      {
        headers: {
          "cache-control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
        },
      },
    );
  }

  // SLOW PATH: first time we've looked this song up. Hit iTunes,
  // match on BOTH title and artist, store the result on the row, return.
  const primaryArtist = s.artist.split(/[,&/]| feat\.?| ft\.?| with /i)[0]?.trim() || s.artist;
  // Strip trailing qualifiers that wreck iTunes matching: "(4-track)",
  // "[Live]", " - 2011 Remaster", "(feat. X)". Keep the original as a
  // fallback if stripping leaves nothing.
  const searchTitle = stripQualifiers(s.title) || s.title;
  const term = `${searchTitle} ${primaryArtist}`.trim();
  let previewUrl: string | null = null;
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?media=music&entity=song&limit=15&term=${encodeURIComponent(term)}`,
      {
        headers: { "user-agent": "TunedUp/1.0 (https://tuned-up.com)" },
        signal: AbortSignal.timeout(5000),
        next: { revalidate: 86400 },
      },
    );
    if (res.ok) {
      const data: {
        results?: Array<{ previewUrl?: string; artistName?: string; trackName?: string }>;
      } = await res.json();
      const wantArtist = norm(primaryArtist);
      const wantTitle = norm(searchTitle);
      const wantTitleTokens = wantTitle.split(" ").filter(Boolean);

      // Score each candidate on title closeness, but ONLY among
      // candidates whose artist matches. The old code took the first
      // artist match regardless of title, so a search that surfaced a
      // different track by the same artist first (e.g. any Jack Johnson
      // song for "Bubble Toes") returned the WRONG preview — and we
      // cached it forever. Now we require real title overlap.
      let best: { previewUrl?: string } | null = null;
      let bestScore = 0;
      for (const c of data.results ?? []) {
        const ca = norm(c.artistName ?? "");
        const artistOk = !!ca && (ca.includes(wantArtist) || wantArtist.includes(ca));
        if (!artistOk) continue;
        const ts = titleScore(c.trackName ?? "", wantTitle, wantTitleTokens);
        if (ts > bestScore) {
          bestScore = ts;
          best = c;
        }
      }
      // Require at least a half-title-token overlap (score >= 2). A wrong
      // preview is worse than none, so an artist-only match is rejected.
      previewUrl = bestScore >= 2 ? best?.previewUrl ?? null : null;
    }
  } catch (e) {
    // iTunes timed out or hit a transient error. Don't mark
    // preview_checked so we retry on the next request.
    reportError(e, "preview-url itunes");
    return NextResponse.json({
      previewUrl: null,
      title: s.title,
      artist: s.artist,
      album: s.album,
      thumbnail: s.thumbnail,
    });
  }

  // Persist the result (URL or null) so we don't re-hit iTunes for
  // this song again. Best-effort — a write failure shouldn't block the
  // response, since we still have a valid answer for the client.
  try {
    await db
      .update(songs)
      .set({ previewUrl, previewChecked: true })
      .where(eq(songs.id, songId));
  } catch (e) {
    reportError(e, "preview-url cache write");
  }

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
        "cache-control":
          "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
      },
    },
  );
}

// Lowercase + collapse every run of non-alphanumerics to a single
// space. The canonical form for fuzzy title/artist comparison.
function norm(x: string): string {
  return x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Drop parenthetical/bracketed qualifiers and a trailing " - ..." suffix
// that derail iTunes matching: "Taylor (4-track)" -> "Taylor",
// "Flake [Live]" -> "Flake", "Song - 2011 Remaster" -> "Song".
function stripQualifiers(x: string): string {
  return x
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+-\s+.*$/, " ")
    .trim();
}

// How well an iTunes candidate's track name matches the wanted title:
//   4 exact · 3 substring · 2 ≥half token overlap · 1 any overlap · 0 none
// Callers accept a match only at >= 2, so an artist match with an
// unrelated title (the old failure mode) scores 0 and is rejected.
function titleScore(
  trackName: string,
  wantTitle: string,
  wantTitleTokens: string[],
): number {
  const ct = norm(stripQualifiers(trackName));
  if (!ct || !wantTitle) return 0;
  if (ct === wantTitle) return 4;
  if (ct.includes(wantTitle) || wantTitle.includes(ct)) return 3;
  if (wantTitleTokens.length === 0) return 0;
  const candTokens = new Set(ct.split(" ").filter(Boolean));
  const overlap = wantTitleTokens.filter((w) => candTokens.has(w)).length;
  if (overlap === 0) return 0;
  return overlap / wantTitleTokens.length >= 0.5 ? 2 : 1;
}
