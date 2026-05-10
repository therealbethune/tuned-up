import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, songs, ratings, activities, recommendations, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { resolveAppleMusicUrl } from "@/lib/apple-music";
import { ensureSpotifyTrackIdCached } from "@/lib/spotify-server";
import { sendPushToUser } from "@/lib/push";
import { computeStreak } from "@/lib/streak";
import {
  maybeAnnounceStreakMilestone,
  refreshUserStreak,
} from "@/lib/streak-milestones";
import { encodeBase64Url } from "@/lib/encoding";

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
  // Length-bound the user-supplied song metadata so a hostile client can't
  // stuff the songs row with megabyte-sized strings.
  if (
    typeof song.id !== "string" || song.id.length > 256 ||
    typeof song.title !== "string" || song.title.length > 500 ||
    typeof song.artist !== "string" || song.artist.length > 500 ||
    (song.album != null && (typeof song.album !== "string" || song.album.length > 500)) ||
    (song.thumbnail != null && (typeof song.thumbnail !== "string" || song.thumbnail.length > 1024))
  ) {
    return NextResponse.json({ error: "song metadata too large" }, { status: 400 });
  }
  if (review != null && (typeof review !== "string" || review.length > 5000)) {
    return NextResponse.json({ error: "review too long" }, { status: 400 });
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

  // Best-effort: resolve & cache the Spotify track id for tracks (not albums)
  // so the "Open in Spotify" link is direct, not a search. Fire-and-forget —
  // failures shouldn't block the rating from saving.
  if (kind === "song" && !song.id.startsWith("spotify:")) {
    ensureSpotifyTrackIdCached(song.id, song.title, song.artist).catch(() => {});
  }

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
        // Actor's rating is the one this match points to.
        ratingUserId: userId,
      }));
      // Best-effort; don't fail the rating if activity insert fails.
      try {
        await db.insert(activities).values(toInsert);
      } catch {
        /* ignore */
      }
    }
  }

  // Recompute the cached streak now that a new rating landed, and fire a
  // milestone celebration if they crossed 7 / 14 / 30 / 60 / 100 / etc.
  // Best-effort — never block the rating save on this.
  if (isNewRating) {
    try {
      const streak = await computeStreak(userId);
      const refreshed = await refreshUserStreak(userId, streak);
      await maybeAnnounceStreakMilestone(
        userId,
        refreshed.after,
        refreshed.previousMilestone,
      );
    } catch {
      /* ignore */
    }
  }

  // Mark any pending recommendations of this song to this user as 'rated' —
  // they've now done what was suggested. Capture WHO recommended it so we
  // can notify them.
  const ratedRecs = await db
    .update(recommendations)
    .set({ status: "rated" })
    .where(
      and(
        eq(recommendations.toUserId, userId),
        eq(recommendations.songId, song.id),
        eq(recommendations.status, "pending"),
      ),
    )
    .returning({ id: recommendations.id, fromUserId: recommendations.fromUserId });

  // For each rec we just resolved, send the recommender a push + drop an
  // activity row. Best-effort: failures don't roll back the rating.
  if (ratedRecs.length > 0) {
    try {
      const [me] = await db
        .select({ username: users.username, displayName: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const myName = me?.displayName || me?.username || "Someone";
      const finalScore = Math.round(s);

      await Promise.allSettled(
        ratedRecs.map(async (r) => {
          await db.insert(activities).values({
            id: randomUUID(),
            userId: r.fromUserId,
            actorId: userId,
            type: "rec_rated",
            songId: song.id,
            // The rating that was just made — owned by the rater (actor).
            ratingUserId: userId,
          });
          await sendPushToUser(r.fromUserId, {
            title: `🎯 ${myName} rated your rec`,
            body: `${song.title} — ${finalScore}/100`,
            url: `/r/${encodeURIComponent(me?.username || "")}/${encodeBase64Url(song.id)}`,
            tag: `rec_rated:${r.id}`,
          });
        }),
      );
    } catch {
      /* swallow */
    }
  }

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
