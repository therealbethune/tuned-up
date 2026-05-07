import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, songs, ratings, activities, recommendations } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { resolveAppleMusicUrl } from "@/lib/apple-music";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await syncCurrentUser();

  const body = await req.json();
  const { song, score, review } = body ?? {};
  if (!song?.id || !song.title || !song.artist) {
    return NextResponse.json({ error: "invalid song" }, { status: 400 });
  }
  const s = Number(score);
  if (!Number.isFinite(s) || s < 1 || s > 100) {
    return NextResponse.json({ error: "score must be 1-100" }, { status: 400 });
  }

  // Detect kind from id prefix (or accept it from the client).
  const kind: "song" | "album" =
    song.kind === "album" || song.id.startsWith("yt-album:") || song.id.startsWith("spotify-album:")
      ? "album"
      : "song";

  // Look up the canonical Apple Music URL once on first save. We do this
  // before the upsert so a brand-new song row gets the link immediately.
  // If iTunes is slow/down, we just skip it (column stays null and the
  // streaming-links UI falls back to the search URL).
  const [existing] = await db
    .select({ appleMusicUrl: songs.appleMusicUrl })
    .from(songs)
    .where(eq(songs.id, song.id))
    .limit(1);

  let appleMusicUrl: string | null = existing?.appleMusicUrl ?? null;
  if (!appleMusicUrl) {
    appleMusicUrl = await resolveAppleMusicUrl({ title: song.title, artist: song.artist, kind });
  }

  await db
    .insert(songs)
    .values({
      id: song.id,
      kind,
      title: song.title,
      artist: song.artist,
      album: song.album ?? null,
      thumbnail: song.thumbnail ?? null,
      durationSeconds: song.durationSeconds ?? null,
      appleMusicUrl,
    })
    .onConflictDoUpdate({
      target: songs.id,
      set: {
        kind,
        title: song.title,
        artist: song.artist,
        album: song.album ?? null,
        thumbnail: song.thumbnail ?? null,
        // Don't blow away an existing apple_music_url with null on a re-save.
        ...(appleMusicUrl ? { appleMusicUrl } : {}),
      },
    });

  // Detect whether this is a NEW rating (vs an update of an existing one) by
  // checking for a prior row before the upsert.
  const [prior] = await db
    .select({ songId: ratings.songId })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, song.id)))
    .limit(1);
  const isNewRating = !prior;

  const now = new Date();
  await db
    .insert(ratings)
    .values({ userId, songId: song.id, score: Math.round(s), review: review ?? null, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.songId],
      set: { score: Math.round(s), review: review ?? null, updatedAt: now },
    });

  // Notify everyone else who's already rated the same song that someone new
  // has now rated it too. Only fires the FIRST time this user rates the song.
  if (isNewRating) {
    const others = await db
      .select({ userId: ratings.userId })
      .from(ratings)
      .where(and(eq(ratings.songId, song.id), ne(ratings.userId, userId)));

    if (others.length > 0) {
      const toInsert = others.map((o) => ({
        id: randomUUID(),
        userId: o.userId,
        actorId: userId,
        type: "rating_match",
        songId: song.id,
      }));
      // Best-effort; don't fail the rating if activity insert fails.
      try {
        await db.insert(activities).values(toInsert);
      } catch {
        /* ignore */
      }
    }
  }

  // Mark any pending recommendations of this song to this user as 'rated' —
  // they've now done what was suggested.
  await db
    .update(recommendations)
    .set({ status: "rated" })
    .where(
      and(
        eq(recommendations.toUserId, userId),
        eq(recommendations.songId, song.id),
        eq(recommendations.status, "pending"),
      ),
    );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { songId } = (await req.json().catch(() => ({}))) ?? {};
  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });

  await db
    .delete(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)));

  return NextResponse.json({ ok: true });
}
