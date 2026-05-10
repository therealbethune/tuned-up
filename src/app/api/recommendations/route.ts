import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, recommendations, users, songs, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";
import { resolveAppleMusicUrl } from "@/lib/apple-music";
import { extractMentions } from "@/lib/mentions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list pending recommendations for the current user, newest first.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: recommendations.id,
      message: recommendations.message,
      createdAt: recommendations.createdAt,
      status: recommendations.status,
      fromUserId: recommendations.fromUserId,
      fromUsername: users.username,
      fromDisplayName: users.displayName,
      fromImageUrl: users.imageUrl,
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      album: songs.album,
      thumbnail: songs.thumbnail,
      appleMusicUrl: songs.appleMusicUrl,
      kind: songs.kind,
    })
    .from(recommendations)
    .innerJoin(users, eq(users.id, recommendations.fromUserId))
    .innerJoin(songs, eq(songs.id, recommendations.songId))
    .where(and(eq(recommendations.toUserId, userId), eq(recommendations.status, "pending")))
    .orderBy(desc(recommendations.createdAt))
    .limit(50);

  return NextResponse.json({ recommendations: rows });
}

// POST — create a recommendation. Body: { toUsername, song: SongResult, message? }
//   `song` should be the full SongResult shape (id, title, artist, etc.) so we
//   can upsert the song row if it doesn't exist yet — same pattern as /api/ratings.
export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await syncCurrentUser();

    const body = await req.json().catch(() => ({}));
    const toUsername: string | undefined = body?.toUsername;
    const song = body?.song;
    const message: string | null = body?.message ? String(body.message).slice(0, 200) : null;

    if (!toUsername || !song?.id || !song.title || !song.artist) {
      return NextResponse.json(
        { error: "toUsername and song (id, title, artist) are required" },
        { status: 400 },
      );
    }
    // Length-bound the user-supplied song metadata.
    if (
      typeof toUsername !== "string" || toUsername.length > 64 ||
      typeof song.id !== "string" || song.id.length > 256 ||
      typeof song.title !== "string" || song.title.length > 500 ||
      typeof song.artist !== "string" || song.artist.length > 500
    ) {
      return NextResponse.json({ error: "fields too long" }, { status: 400 });
    }

    const [target] = await db.select().from(users).where(eq(users.username, toUsername)).limit(1);
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
    if (target.id === userId) {
      return NextResponse.json({ error: "cannot recommend to yourself" }, { status: 400 });
    }

    // Upsert the song so the FK is satisfied. Same logic as /api/ratings POST.
    const kind: "song" | "album" =
      song.kind === "album" || song.id.startsWith("yt-album:") || song.id.startsWith("spotify-album:")
        ? "album"
        : "song";

    const [existing] = await db
      .select({ appleMusicUrl: songs.appleMusicUrl })
      .from(songs)
      .where(eq(songs.id, song.id))
      .limit(1);
    let appleMusicUrl: string | null = existing?.appleMusicUrl ?? null;
    if (!appleMusicUrl) {
      try {
        appleMusicUrl = await resolveAppleMusicUrl({
          title: song.title,
          artist: song.artist,
          kind,
        });
      } catch {
        appleMusicUrl = null;
      }
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
          ...(appleMusicUrl ? { appleMusicUrl } : {}),
        },
      });

    // Insert / refresh the recommendation. Unique on (from, to, song).
    const id = randomUUID();
    const inserted = await db
      .insert(recommendations)
      .values({
        id,
        fromUserId: userId,
        toUserId: target.id,
        songId: song.id,
        message,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [recommendations.fromUserId, recommendations.toUserId, recommendations.songId],
        set: { message, status: "pending", createdAt: new Date() },
      })
      .returning({ id: recommendations.id });
    const recId = inserted[0]?.id ?? id;

    // Activity. Best-effort — don't fail the recommendation if this errors.
    try {
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, target.id),
            eq(activities.actorId, userId),
            eq(activities.type, "recommendation"),
            eq(activities.songId, song.id),
          ),
        );
      await db.insert(activities).values({
        id: randomUUID(),
        userId: target.id,
        actorId: userId,
        type: "recommendation",
        songId: song.id,
      });
    } catch (e) {
      console.error("[recommendations POST] activity insert failed:", e);
    }

    // Push notification — best-effort.
    let actorName = "Someone";
    let actorUsername = "";
    try {
      const [me] = await db
        .select({ displayName: users.displayName, username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      actorName = me?.displayName || me?.username || "Someone";
      actorUsername = me?.username ?? "";
      await sendPushToUser(target.id, {
        title: `${actorName} recommends ${song.title}`,
        body: message || `${song.artist} — open Tuned Up to rate it.`,
        url: "/recommendations",
        tag: `rec:${userId}:${song.id}`,
      });
    } catch (e) {
      console.error("[recommendations POST] push send failed:", e);
    }

    // Notify any users @mentioned in the message body — but skip the
    // sender (self) and the recipient (already notified above).
    if (message) {
      try {
        const mentioned = extractMentions(message);
        if (mentioned.length > 0) {
          const mUsers = await db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.username, mentioned));
          for (const u of mUsers) {
            if (u.id === userId || u.id === target.id) continue;
            await db
              .delete(activities)
              .where(
                and(
                  eq(activities.userId, u.id),
                  eq(activities.actorId, userId),
                  eq(activities.type, "mention"),
                  eq(activities.songId, song.id),
                ),
              );
            await db.insert(activities).values({
              id: randomUUID(),
              userId: u.id,
              actorId: userId,
              type: "mention",
              songId: song.id,
            });
            const preview =
              message.length > 100 ? message.slice(0, 97) + "…" : message;
            await sendPushToUser(u.id, {
              title: `${actorName} mentioned you on ${song.title}`,
              body: preview,
              url: actorUsername ? `/u/${actorUsername}` : "/feed",
              tag: `mention:${userId}:${song.id}:${u.id}`,
            });
          }
        }
      } catch (e) {
        console.error("[recommendations POST] mention notify failed:", e);
      }
    }

    return NextResponse.json({ ok: true, id: recId });
  } catch (e) {
    console.error("[recommendations POST] unexpected error:", e);
    return NextResponse.json(
      { error: (e as Error).message || "Internal error" },
      { status: 500 },
    );
  }
}

// DELETE — dismiss / withdraw a recommendation by id. Both sender and
// recipient can remove it.
export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await req.json().catch(() => ({}))) ?? {};
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [r] = await db.select().from(recommendations).where(eq(recommendations.id, id)).limit(1);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (r.fromUserId !== userId && r.toUserId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await db
    .update(recommendations)
    .set({ status: "dismissed" })
    .where(eq(recommendations.id, id));

  return NextResponse.json({ ok: true });
}
