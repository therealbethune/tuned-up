import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db, savedSongs, songs } from "@/db";
import { reportError } from "@/lib/report-error";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/saved
// Body: { songId: string, song?: SongResult }
//
// Toggles a save for later. If `song` is provided, upserts the song
// row first so the FK is satisfied even when the user saves something
// they haven't rated yet (the songs table is otherwise populated by
// /api/ratings POST and would be empty for unrated catalog items).
// Returns: { saved: boolean }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Rate-limit saves to prevent a stuck client from hammering the
  // toggle. Counts the user's own saved_songs writes in the window.
  const limited = await enforce(LIMITS.SAVES, async () => {
    const [row] = await db
      .select({ n: count() })
      .from(savedSongs)
      .where(
        and(
          eq(savedSongs.userId, userId),
          gte(savedSongs.createdAt, windowStartDate(LIMITS.SAVES.windowSec)),
        ),
      );
    return Number(row?.n ?? 0);
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const songId = typeof b.songId === "string" ? b.songId : "";
  if (!songId || songId.length > 256) {
    return NextResponse.json({ error: "bad_song_id" }, { status: 400 });
  }

  // Optional song payload — used when saving a song the user found via
  // search that doesn't have a `songs` row yet. Mirrors the upsert
  // pattern in /api/ratings + /api/recommendations.
  const song = b.song as
    | {
        id: string;
        kind?: "song" | "album";
        title?: string;
        artist?: string;
        album?: string | null;
        thumbnail?: string | null;
        durationSeconds?: number | null;
      }
    | undefined;
  if (song && song.id === songId && song.title && song.artist) {
    try {
      await db
        .insert(songs)
        .values({
          id: song.id,
          kind: song.kind === "album" ? "album" : "song",
          title: song.title,
          artist: song.artist,
          album: song.album ?? null,
          thumbnail: song.thumbnail ?? null,
          durationSeconds: song.durationSeconds ?? null,
        })
        .onConflictDoNothing();
    } catch (e) {
      reportError(e, "saved POST song upsert");
    }
  }

  try {
    // Toggle: if row exists, delete; otherwise insert.
    const existing = await db
      .select({ songId: savedSongs.songId })
      .from(savedSongs)
      .where(and(eq(savedSongs.userId, userId), eq(savedSongs.songId, songId)))
      .limit(1);
    if (existing.length > 0) {
      await db
        .delete(savedSongs)
        .where(and(eq(savedSongs.userId, userId), eq(savedSongs.songId, songId)));
      return NextResponse.json({ saved: false });
    }
    await db
      .insert(savedSongs)
      .values({ userId, songId })
      .onConflictDoNothing();
    return NextResponse.json({ saved: true });
  } catch (e) {
    reportError(e, "saved POST toggle");
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
