import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { db, soundBites, ratings } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Max upload size — 15 seconds of webm/opus is comfortably under 200KB.
// Cap at 1MB hard so a misbehaving recorder can't fill the bucket.
const MAX_BYTES = 1024 * 1024;
const MAX_DURATION_MS = 20_000;

// POST /api/sound-bites
// multipart/form-data with fields: audio (Blob), songId, durationMs
// Stores the audio in Netlify Blobs and writes a sound_bites row.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const songId = String(form.get("songId") || "");
  const durationMs = Number(form.get("durationMs") || 0);
  const audio = form.get("audio");

  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });
  if (!(audio instanceof Blob)) return NextResponse.json({ error: "audio missing" }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "audio too large" }, { status: 413 });
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) {
    return NextResponse.json({ error: "invalid duration" }, { status: 400 });
  }

  // Must have rated the song to attach a bite — keeps spam at bay.
  const [r] = await db
    .select({ s: ratings.songId })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)))
    .limit(1);
  if (!r) {
    return NextResponse.json({ error: "rate the song first" }, { status: 412 });
  }

  // Upload to Netlify Blobs.
  const store = getStore({ name: "sound-bites" });
  const id = randomUUID();
  const key = `${userId}/${id}.webm`;
  const buf = await audio.arrayBuffer();
  await store.set(key, buf, {
    metadata: { userId, songId, durationMs },
  });

  // Public URL for the blob — Netlify Blobs are private by default; we proxy
  // them through our own /api/sound-bites/<key> GET endpoint below.
  const audioUrl = `/api/sound-bites/play?key=${encodeURIComponent(key)}`;

  // Upsert (one bite per user×song — re-recording replaces).
  await db
    .insert(soundBites)
    .values({ id, userId, songId, audioUrl, durationMs: Math.round(durationMs) })
    .onConflictDoUpdate({
      target: [soundBites.userId, soundBites.songId],
      set: { id, audioUrl, durationMs: Math.round(durationMs) },
    });

  return NextResponse.json({ ok: true, audioUrl, durationMs });
}

// DELETE /api/sound-bites?songId=...  — remove your bite for a song.
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const songId = url.searchParams.get("songId") || "";
  if (!songId) return NextResponse.json({ error: "songId required" }, { status: 400 });
  await db
    .delete(soundBites)
    .where(and(eq(soundBites.userId, userId), eq(soundBites.songId, songId)));
  return NextResponse.json({ ok: true });
}
