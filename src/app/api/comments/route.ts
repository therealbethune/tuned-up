import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, comments, users, ratings, activities, songs } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";
import { encodeBase64Url } from "@/lib/encoding";
import { extractMentions } from "@/lib/mentions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/comments?u=<ratingUserId>&s=<songId>
// Returns the list of comments for a single (ratingUserId, songId) target,
// each enriched with the commenter's score on the same song (if they have one).
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const ratingUserId = url.searchParams.get("u");
  const songId = url.searchParams.get("s");
  if (!ratingUserId || !songId) {
    return NextResponse.json({ error: "u and s required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      commenterId: comments.commenterId,
      parentCommentId: comments.parentCommentId,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      score: ratings.score,
      review: ratings.review,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.commenterId))
    .leftJoin(
      ratings,
      and(eq(ratings.userId, comments.commenterId), eq(ratings.songId, comments.songId)),
    )
    .where(and(eq(comments.ratingUserId, ratingUserId), eq(comments.songId, songId)))
    .orderBy(asc(comments.createdAt))
    .limit(200);

  return NextResponse.json({ comments: rows });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { ratingUserId, songId, body, parentCommentId: parentIdRaw } =
    (await req.json().catch(() => ({}))) ?? {};
  const text = (body ?? "").toString().trim();
  if (!ratingUserId || !songId || !text) {
    return NextResponse.json({ error: "ratingUserId, songId, and body are required" }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: "comment too long" }, { status: 400 });
  }

  // Confirm the rating exists; FK would catch this but the error is friendlier here.
  const [r] = await db
    .select({ userId: ratings.userId })
    .from(ratings)
    .where(and(eq(ratings.userId, ratingUserId), eq(ratings.songId, songId)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "rating not found" }, { status: 404 });

  // If this is a reply, validate the parent and flatten any reply-to-reply
  // chain (so replies are always at depth 1).
  let parentCommentId: string | null = null;
  let parentCommenterId: string | null = null;
  if (parentIdRaw) {
    const [p] = await db
      .select({
        id: comments.id,
        commenterId: comments.commenterId,
        ratingUserId: comments.ratingUserId,
        songId: comments.songId,
        parentCommentId: comments.parentCommentId,
      })
      .from(comments)
      .where(eq(comments.id, String(parentIdRaw)))
      .limit(1);
    if (p && p.ratingUserId === ratingUserId && p.songId === songId) {
      // Flatten — reply to a reply attaches to the same top-level parent.
      parentCommentId = p.parentCommentId ?? p.id;
      parentCommenterId = p.commenterId;
    }
  }

  const id = randomUUID();
  await db.insert(comments).values({
    id,
    ratingUserId,
    songId,
    commenterId: userId,
    parentCommentId,
    body: text,
  });

  // Notify mentioned users — but skip the comment author and the rating
  // owner (who already gets the comment notification a few lines below).
  // Cap at MENTION_LIMIT to prevent comment-spam-as-pingflood: a hostile
  // user can't ping 200 people just by stuffing usernames into a comment.
  const MENTION_LIMIT = 10;
  const mentionedUsernames = extractMentions(text).slice(0, MENTION_LIMIT);
  if (mentionedUsernames.length > 0) {
    try {
      // Batch the supporting queries — mentioned users, author, song,
      // rating owner — instead of one-after-another sequential awaits.
      const [mentionedUsers, author, songRow, ratingOwnerRow] = await Promise.all([
        db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
          })
          .from(users)
          .where(inArray(users.username, mentionedUsernames)),
        db
          .select({ displayName: users.displayName, username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .then((r) => r[0]),
        db
          .select({ title: songs.title })
          .from(songs)
          .where(eq(songs.id, songId))
          .limit(1)
          .then((r) => r[0]),
        db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, ratingUserId))
          .limit(1)
          .then((r) => r[0]),
      ]);
      const authorName = author?.displayName || author?.username || "Someone";
      const mentionRatingPageUrl = ratingOwnerRow
        ? `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`
        : `/u/${author?.username ?? ""}`;

      const preview = text.length > 100 ? text.slice(0, 97) + "…" : text;
      // Fan out activity + push in parallel — sequential awaits were
      // adding ~200ms × N mentions to the comment-post latency.
      await Promise.allSettled(
        mentionedUsers
          .filter((u) => u.id !== userId && u.id !== ratingUserId)
          .map(async (u) => {
            // Dedupe a previous mention from the same actor on the same
            // comment target so refreshing doesn't pile up entries.
            await db
              .delete(activities)
              .where(
                and(
                  eq(activities.userId, u.id),
                  eq(activities.actorId, userId),
                  eq(activities.type, "mention"),
                  eq(activities.songId, songId),
                ),
              );
            await db.insert(activities).values({
              id: randomUUID(),
              userId: u.id,
              actorId: userId,
              type: "mention",
              songId,
              ratingUserId,
            });
            await sendPushToUser(u.id, {
              title: `${authorName} mentioned you${songRow ? ` on ${songRow.title}` : ""}`,
              body: preview,
              url: mentionRatingPageUrl,
              tag: `mention:${userId}:${songId}:${u.id}`,
            });
          }),
      );
    } catch (e) {
      console.error("[comments POST] mention notify failed:", e);
    }
  }

  // Activity + push to the rating owner. For top-level comments, type is
  // 'comment'. For replies, the rating owner still gets one but typed as
  // 'comment' (same UX) — the reply-specific notification goes to the
  // parent comment author below.
  const [actor] = await db
    .select({ displayName: users.displayName, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [song] = await db
    .select({ title: songs.title })
    .from(songs)
    .where(eq(songs.id, songId))
    .limit(1);
  const actorName = actor?.displayName || actor?.username || "Someone";
  const preview = text.length > 80 ? text.slice(0, 77) + "…" : text;

  // Look up the rating owner's username so push URLs can deep-link to
  // /r/<owner>/<songId> (the shared rating page where the comment lives).
  const [ratingOwner] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, ratingUserId))
    .limit(1);
  // Feed-focus URL — works whether or not the recipient follows the
  // rating owner. The ?focus=<userId>:<songId> param forces inclusion.
  const ratingPageUrl = `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`;
  // Keep a /u/<actor> fallback only if we couldn't even resolve the owner.
  const fallbackUrl = ratingOwner
    ? ratingPageUrl
    : `/u/${actor?.username ?? ""}`;

  if (ratingUserId !== userId) {
    await db.insert(activities).values({
      id: randomUUID(),
      userId: ratingUserId,
      actorId: userId,
      type: "comment",
      songId,
      ratingUserId,
    });
    await sendPushToUser(ratingUserId, {
      title: `${actorName} commented on ${song?.title ?? "your rating"}`,
      body: preview,
      // Rating owner = recipient: focus-param URL guarantees the card
      // shows on the feed even if pagination would have hidden it.
      url: `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`,
      tag: `comment:${userId}:${songId}`,
    });
  }

  // If this is a reply, additionally notify the parent comment's author —
  // unless they're the rating owner (already notified above) or themselves.
  if (parentCommenterId && parentCommenterId !== userId && parentCommenterId !== ratingUserId) {
    try {
      await db.insert(activities).values({
        id: randomUUID(),
        userId: parentCommenterId,
        actorId: userId,
        type: "reply",
        songId,
        ratingUserId,
      });
      await sendPushToUser(parentCommenterId, {
        title: `${actorName} replied to your comment`,
        body: preview,
        // Parent commenter isn't necessarily the rating owner, so we
        // can't anchor to their feed — link to the rating's shared page.
        url: fallbackUrl,
        tag: `reply:${userId}:${songId}`,
      });
    } catch (e) {
      console.error("[comments POST] reply notify failed:", e);
    }
  }

  // Return the new comment with commenter info to avoid a second round-trip.
  const [me] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [myRating] = await db
    .select({ score: ratings.score, review: ratings.review })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)))
    .limit(1);

  return NextResponse.json({
    comment: {
      id,
      body: text,
      createdAt: new Date(),
      commenterId: userId,
      parentCommentId,
      username: me?.username,
      displayName: me?.displayName,
      imageUrl: me?.imageUrl,
      score: myRating?.score ?? null,
      review: myRating?.review ?? null,
    },
  });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { commentId } = (await req.json().catch(() => ({}))) ?? {};
  if (!commentId) return NextResponse.json({ error: "commentId required" }, { status: 400 });

  // Only the commenter (or the rating owner) can delete.
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.commenterId !== userId && c.ratingUserId !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await db.delete(comments).where(eq(comments.id, commentId));
  return NextResponse.json({ ok: true });
}

// (asc/desc imports kept for future tooling; silence unused warning)
void desc;
