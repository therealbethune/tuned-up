import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, songs, ratings } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

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

  await db
    .insert(songs)
    .values({
      id: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album ?? null,
      thumbnail: song.thumbnail ?? null,
      durationSeconds: song.durationSeconds ?? null,
    })
    .onConflictDoUpdate({
      target: songs.id,
      set: { title: song.title, artist: song.artist, album: song.album ?? null, thumbnail: song.thumbnail ?? null },
    });

  const now = new Date();
  await db
    .insert(ratings)
    .values({ userId, songId: song.id, score: Math.round(s), review: review ?? null, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.songId],
      set: { score: Math.round(s), review: review ?? null, updatedAt: now },
    });

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
