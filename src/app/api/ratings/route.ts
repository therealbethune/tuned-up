import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, songs, ratings, activities, recommendations, users, savedSongs, follows } from "@/db";
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
import { extractMentions } from "@/lib/mentions";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { isValidMood } from "@/lib/moods";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await syncCurrentUser();

  // Guard against malformed JSON bodies — bare `await req.json()` throws
  // a 500 instead of a 400, which then crashes the route + spams Sentry.
  const body = await req.json().catch(() => null);
  const { song, score, review, mood: rawMood } = body ?? {};
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

  // Rate-limit: ratings is intentionally the most generous bucket
  // because /import/spotify can fire ~50 rapid POSTs as the user taps
  // chips. We count by `updatedAt` (not `createdAt`) so re-rating an
  // existing song also counts — otherwise a script could keep editing
  // the same row without limit. The bulk-rate flow only re-rates if
  // the user re-taps, so this remains permissive for real use.
  const limited = await enforce(LIMITS.RATINGS, async () => {
    const start = windowStartDate(LIMITS.RATINGS.windowSec);
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), gte(ratings.updatedAt, start)));
    return Number(r?.c ?? 0);
  });
  if (limited) return limited;

  // Detect kind from id prefix (or accept it from the client).
  const kind: "song" | "album" =
    song.kind === "album" || song.id.startsWith("yt-album:") || song.id.startsWith("spotify-album:")
      ? "album"
      : "song";

  // Look up whether we already have the canonical Apple Music URL on file.
  // We DO NOT block the save on the lookup — iTunes can take 1–5 seconds
  // on a cold cache, which used to sit on the user's "Save rating" tap.
  // Instead, save the row immediately; if we don't have an apple_music_url
  // yet, fire a background resolve + UPDATE WHERE apple_music_url IS NULL
  // so the link materializes by the time anyone clicks the streaming icon.
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
        // Don't blow away an existing apple_music_url on a re-save.
      },
    });

  // Background-resolve the Apple Music URL on first save. Fire-and-forget;
  // any failure (iTunes 4xx/5xx, timeout, no match) leaves the column null
  // and the streaming-links UI falls back to a search URL.
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

  // Optional mood tag — validated against the constrained palette so
  // hostile clients can't smuggle arbitrary strings onto rating rows.
  const mood = isValidMood(rawMood) ? rawMood : null;

  const now = new Date();
  await db
    .insert(ratings)
    .values({
      userId,
      songId: song.id,
      score: Math.round(s),
      review: review ?? null,
      mood,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [ratings.userId, ratings.songId],
      set: { score: Math.round(s), review: review ?? null, mood, updatedAt: now },
    });

  // Clear the save-for-later bookmark for this song (if one exists) —
  // a rating supersedes a "rate it later" intent. Fire-and-forget;
  // worst case the row sticks around and the user manually unsaves.
  try {
    await db
      .delete(savedSongs)
      .where(and(eq(savedSongs.userId, userId), eq(savedSongs.songId, song.id)));
  } catch {
    /* non-critical */
  }

  // Notify mentioned users — anyone @-tagged in the review gets a push +
  // activity row pointing at this rating. Cap at 10 to prevent
  // pingflood-via-stuffed-caption, parallel via allSettled, dedupe prior
  // mention activities so editing doesn't pile up entries.
  if (typeof review === "string" && review.includes("@")) {
    const mentioned = extractMentions(review).slice(0, 10);
    if (mentioned.length > 0) {
      try {
        const [mUsers, [author]] = await Promise.all([
          db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.username, mentioned)),
          db
            .select({ displayName: users.displayName, username: users.username })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1),
        ]);
        const authorName = author?.displayName || author?.username || "Someone";
        const finalScore = Math.round(s);
        const preview =
          review.length > 100 ? review.slice(0, 97) + "…" : review;
        // Skip self-mentions.
        await Promise.allSettled(
          mUsers
            .filter((u) => u.id !== userId)
            .map(async (u) => {
              // Activity replacement and push can land in parallel —
              // push doesn't need the activity row to have been written.
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
                    // Author of the rating is the rating owner. We're the actor.
                    ratingUserId: userId,
                  });
                })(),
                sendPushToUser(u.id, {
                  title: `${authorName} mentioned you in a rating`,
                  body: `${song.title} — ${finalScore}/100${preview ? `: ${preview}` : ""}`,
                  // Feed focus URL forces the rating's card to render
                  // even if the mentioned user doesn't follow the
                  // author — the notification + activity destinations
                  // both land here.
                  url: `/feed?focus=${userId}:${encodeURIComponent(song.id)}#rating-${userId}-${encodeBase64Url(song.id)}`,
                  tag: `mention-rating:${userId}:${song.id}:${u.id}`,
                  category: "mention",
                }),
              ]);
            }),
        );
      } catch (e) {
        reportError(e, "ratings POST mention notify");
      }
    }
  }

  // Notify everyone else who's already rated the same song that someone new
  // has now rated it too. Only fires the FIRST time this user rates the song.
  if (isNewRating) {
    const others = await db
      .select({ userId: ratings.userId, score: ratings.score })
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
      // onConflictDoNothing covers the simultaneous-double-rate race
      // against the activities_dedup_with_song partial unique index.
      try {
        await db.insert(activities).values(toInsert).onConflictDoNothing();
      } catch {
        /* ignore */
      }

      // Taste-convergence milestone: when the new rating is 85+ AND the
      // other rater also scored 85+ AND there's a follow edge in either
      // direction, fire a stronger "you both loved this" activity for
      // both users + push the other one. This makes the moment of
      // taste-convergence visible — the kind of micro-reward that
      // brings users back to look for more matches.
      const score = Math.round(s);
      if (score >= 85) {
        const matches = others.filter((o) => o.score >= 85);
        if (matches.length > 0) {
          const matchIds = matches.map((m) => m.userId);
          try {
            const known = await db
              .select({ otherId: follows.followerId, mine: follows.followeeId })
              .from(follows)
              .where(
                and(
                  or(
                    and(eq(follows.followerId, userId), inArray(follows.followeeId, matchIds)),
                    and(eq(follows.followeeId, userId), inArray(follows.followerId, matchIds)),
                  ),
                  eq(follows.status, "accepted"),
                ),
              );
            const knownIds = new Set<string>();
            for (const k of known) {
              knownIds.add(k.otherId === userId ? k.mine : k.otherId);
            }
            const convergent = matches.filter((m) => knownIds.has(m.userId));
            if (convergent.length > 0) {
              // Fire one activity row PER convergent friend, addressed to
              // THAT friend so they see "X also loved this" in their bell.
              // We used to also create a mirror row for the rater themselves,
              // but at 5+ simultaneous convergences that cluttered the new
              // rater's Activity tab with N rows for one rating event —
              // and they already get the success toast at the rate modal,
              // which is sufficient feedback for their own side.
              const rows = convergent.map((m) => ({
                id: randomUUID(),
                userId: m.userId,
                actorId: userId,
                type: "taste_match",
                songId: song.id,
                ratingUserId: userId,
              }));
              await db.insert(activities).values(rows);

              // Push the other side so they notice the convergence in
              // real time. The new rater is at the rate modal so the
              // toast already serves as their feedback — no double push.
              try {
                const [songRow] = await db
                  .select({ title: songs.title })
                  .from(songs)
                  .where(eq(songs.id, song.id))
                  .limit(1);
                const [meRow] = await db
                  .select({ displayName: users.displayName, username: users.username })
                  .from(users)
                  .where(eq(users.id, userId))
                  .limit(1);
                const actorName = meRow?.displayName || meRow?.username || "Someone";
                await Promise.allSettled(
                  convergent.map((m) =>
                    sendPushToUser(m.userId, {
                      title: `You and ${actorName} both loved this`,
                      body: songRow ? `Both rated ${songRow.title} ${Math.min(score, m.score)}+` : "Taste match!",
                      url: `/feed?focus=${userId}:${encodeURIComponent(song.id)}#rating-${userId}-${encodeBase64Url(song.id)}`,
                      tag: `taste-match:${userId}:${song.id}:${m.userId}`,
                      category: "taste_match",
                    }),
                  ),
                );
              } catch (e) {
                reportError(e, "ratings POST taste-match push");
              }
            }
          } catch (e) {
            reportError(e, "ratings POST taste-match");
          }
        }
      }
    }
  }

  // Recompute the cached streak now that a new rating landed, and fire a
  // milestone celebration if they crossed 7 / 14 / 30 / 60 / 100 / etc.
  // Best-effort — never block the rating save on this.
  if (isNewRating) {
    try {
      const [me] = await db
        .select({ tokens: users.streakFreezeTokens })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const { streak, freezesUsed } = await computeStreak(userId, me?.tokens ?? 0);
      const refreshed = await refreshUserStreak(userId, streak, freezesUsed);
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
          // Activity insert + push fan out — push doesn't need the
          // activity row to have landed first.
          await Promise.allSettled([
            db
              .insert(activities)
              .values({
                id: randomUUID(),
                userId: r.fromUserId,
                actorId: userId,
                type: "rec_rated",
                songId: song.id,
                // The rating that was just made — owned by the rater (actor).
                ratingUserId: userId,
              })
              .onConflictDoNothing(),
            sendPushToUser(r.fromUserId, {
              title: `🎯 ${myName} rated your rec`,
              body: `${song.title} — ${finalScore}/100`,
              // Focus-param URL — recipient may not follow the rater.
              url: `/feed?focus=${userId}:${encodeURIComponent(song.id)}#rating-${userId}-${encodeBase64Url(song.id)}`,
              tag: `rec_rated:${r.id}`,
              category: "rec",
            }),
          ]);
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

  // Sweep activity rows that point at this rating before we drop the
  // rating itself. Comments + likes cascade via their FK to the
  // ratings PK; activities don't have that FK (ratingUserId is a plain
  // text column) so without this step the user's activity bell keeps
  // showing "X liked your rating of Y" with a deep-link to a rating
  // that no longer exists → click yields a 404-feeling empty card.
  // Best-effort; the rating delete itself proceeds either way.
  try {
    await db
      .delete(activities)
      .where(and(eq(activities.ratingUserId, userId), eq(activities.songId, songId)));
  } catch {
    /* ignore — activity cleanup is non-critical */
  }

  await db
    .delete(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)));

  // Refresh the cached streak. Deleting a rating can drop the streak
  // (most-recent-day was the deleted song) — without this, the user
  // row's currentStreak stays at its pre-delete value until they rate
  // again, and /stats / profile both render that stale number. Best-
  // effort; on failure the cache just remains stale for one cycle.
  try {
    const [me] = await db
      .select({ tokens: users.streakFreezeTokens })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const { streak: fresh, freezesUsed } = await computeStreak(userId, me?.tokens ?? 0);
    await refreshUserStreak(userId, fresh, freezesUsed);
  } catch {
    /* ignore */
  }

  return NextResponse.json({ ok: true });
}
