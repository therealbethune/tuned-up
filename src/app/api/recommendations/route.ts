import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, desc, eq, gte, inArray, sql, notInArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, recommendations, users, songs, activities, blocks } from "@/db";
import { getBlockEdges } from "@/lib/block-edges";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";
import { resolveAppleMusicUrl } from "@/lib/apple-music";
import { extractMentions } from "@/lib/mentions";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list pending recommendations for the current user, newest first.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Block-aware: hide recs from anyone on either side of a block edge.
  const { hiddenIds } = await getBlockEdges(userId);

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
    .where(
      hiddenIds.length
        ? and(
            eq(recommendations.toUserId, userId),
            eq(recommendations.status, "pending"),
            notInArray(recommendations.fromUserId, hiddenIds),
          )
        : and(eq(recommendations.toUserId, userId), eq(recommendations.status, "pending")),
    )
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
    // Length-bound every user-supplied string so a hostile client can't
    // stuff the songs row with megabytes of garbage on first recommend.
    // Matches the validation in /api/ratings POST — used to be looser
    // here (album/thumbnail were unchecked).
    if (
      typeof toUsername !== "string" || toUsername.length > 64 ||
      typeof song.id !== "string" || song.id.length > 256 ||
      typeof song.title !== "string" || song.title.length > 500 ||
      typeof song.artist !== "string" || song.artist.length > 500 ||
      (song.album != null && (typeof song.album !== "string" || song.album.length > 500)) ||
      (song.thumbnail != null && (typeof song.thumbnail !== "string" || song.thumbnail.length > 1024))
    ) {
      return NextResponse.json({ error: "fields too long" }, { status: 400 });
    }

    const [target] = await db.select().from(users).where(eq(users.username, toUsername)).limit(1);
    if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
    if (target.id === userId) {
      return NextResponse.json({ error: "cannot recommend to yourself" }, { status: 400 });
    }

    // Block guard — neither side can send a recommendation across a
    // block edge. Same reasoning as follow: refusing the write stops
    // the abuse path of using "rec" as a notification bomb.
    const [blockEdge] = await db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, userId), eq(blocks.blockedId, target.id)),
          and(eq(blocks.blockerId, target.id), eq(blocks.blockedId, userId)),
        ),
      )
      .limit(1);
    if (blockEdge) {
      return NextResponse.json({ error: "blocked" }, { status: 403 });
    }

    // Rate-limit: recs are the highest-cost write (push notification +
    // activity row to the recipient). Cap at 20/minute to stop someone
    // from spam-recommending the same song to dozens of people at once.
    const limited = await enforce(LIMITS.RECOMMENDATIONS, async () => {
      const start = windowStartDate(LIMITS.RECOMMENDATIONS.windowSec);
      const [r] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(recommendations)
        .where(and(eq(recommendations.fromUserId, userId), gte(recommendations.createdAt, start)));
      return Number(r?.c ?? 0);
    });
    if (limited) return limited;

    // Upsert the song so the FK is satisfied. Same logic as /api/ratings POST.
    const kind: "song" | "album" =
      song.kind === "album" || song.id.startsWith("yt-album:") || song.id.startsWith("spotify-album:")
        ? "album"
        : "song";

    // Don't block the user's "Send recommendation" tap on an iTunes
    // lookup (1-5s on a cold cache). Save the row immediately with the
    // existing apple_music_url if any; if we don't have one yet, fire
    // a background resolve + UPDATE WHERE apple_music_url IS NULL.
    // Same pattern as Wave K's /api/ratings fix.
    const [existing] = await db
      .select({ appleMusicUrl: songs.appleMusicUrl })
      .from(songs)
      .where(eq(songs.id, song.id))
      .limit(1);
    const haveAppleMusicUrl = !!existing?.appleMusicUrl;

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
        appleMusicUrl: existing?.appleMusicUrl ?? null,
      })
      .onConflictDoUpdate({
        target: songs.id,
        set: {
          kind,
          title: song.title,
          artist: song.artist,
          album: song.album ?? null,
          thumbnail: song.thumbnail ?? null,
          // Never blow away an existing apple_music_url on re-recommend.
        },
      });

    if (!haveAppleMusicUrl) {
      resolveAppleMusicUrl({ title: song.title, artist: song.artist, kind })
        .then((url) => {
          if (!url) return;
          return db
            .update(songs)
            .set({ appleMusicUrl: url })
            .where(and(eq(songs.id, song.id), sql`${songs.appleMusicUrl} IS NULL`));
        })
        .catch(() => {});
    }

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
      reportError(e, "recommendations POST activity insert");
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
        category: "rec",
      });
    } catch (e) {
      reportError(e, "recommendations POST push send");
    }

    // Notify any users @mentioned in the message body — but skip the
    // sender (self) and the recipient (already notified above).
    if (message) {
      try {
        // Cap mentions at 10 to prevent one-message-pings-200-people abuse.
        const mentioned = extractMentions(message).slice(0, 10);
        if (mentioned.length > 0) {
          const mUsers = await db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.username, mentioned));
          const preview =
            message.length > 100 ? message.slice(0, 97) + "…" : message;
          // Fan out activity inserts + pushes in parallel; sequential
          // awaits were burning ~200ms per recipient.
          await Promise.allSettled(
            mUsers
              .filter((u) => u.id !== userId && u.id !== target.id)
              .map(async (u) => {
                // Activity replacement (delete-then-insert) doesn't gate
                // the push — both can land in parallel. Saves one
                // roundtrip-equivalent of wait per mentioned user.
                await Promise.allSettled([
                  (async () => {
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
                  })(),
                  sendPushToUser(u.id, {
                    title: `${actorName} mentioned you on ${song.title}`,
                    body: preview,
                    url: actorUsername ? `/u/${actorUsername}` : "/feed",
                    tag: `mention:${userId}:${song.id}:${u.id}`,
                    category: "mention",
                  }),
                ]);
              }),
          );
        }
      } catch (e) {
        reportError(e, "recommendations POST mention notify");
      }
    }

    return NextResponse.json({ ok: true, id: recId });
  } catch (e) {
    reportError(e, "recommendations POST unexpected");
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
