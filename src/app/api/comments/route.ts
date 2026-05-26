import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, sql, or, notInArray } from "drizzle-orm";
import { getBlockEdges } from "@/lib/block-edges";
import { randomUUID } from "node:crypto";
import { db, comments, users, ratings, activities, songs, blocks } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { sendPushToUser } from "@/lib/push";
import { encodeBase64Url } from "@/lib/encoding";
import { extractMentions } from "@/lib/mentions";
import { canViewRatingsFrom } from "@/lib/visibility";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

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
  if (
    !ratingUserId ||
    !songId ||
    ratingUserId.length > 64 ||
    songId.length > 256
  ) {
    return NextResponse.json({ error: "u and s required" }, { status: 400 });
  }
  if (!(await canViewRatingsFrom(userId, ratingUserId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Pull the viewer's block edges in parallel so we can strip out
  // comments from either side of a block. Blocking is two-way for
  // visibility per App Store 1.2.
  const { hiddenIds: hiddenList } = await getBlockEdges(userId);

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
    .where(
      hiddenList.length
        ? and(
            eq(comments.ratingUserId, ratingUserId),
            eq(comments.songId, songId),
            notInArray(comments.commenterId, hiddenList),
          )
        : and(eq(comments.ratingUserId, ratingUserId), eq(comments.songId, songId)),
    )
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
  // Length-bound every user-supplied string so a hostile client can't
  // punch through to DB lookups with megabytes of garbage. Match the
  // same caps used elsewhere: ratingUserId (Clerk id) ≤ 64, songId ≤
  // 256, parentCommentId (uuid) ≤ 64, body ≤ 1000.
  if (
    typeof ratingUserId !== "string" || ratingUserId.length > 64 ||
    typeof songId !== "string" || songId.length > 256 ||
    (parentIdRaw != null && (typeof parentIdRaw !== "string" || parentIdRaw.length > 64))
  ) {
    return NextResponse.json({ error: "invalid fields" }, { status: 400 });
  }
  if (text.length > 1000) {
    return NextResponse.json({ error: "comment too long" }, { status: 400 });
  }

  // Rate-limit: comments are the easiest write to abuse (no rating
  // required, just text). Cap at 15/minute, far above any human pace
  // but well below what a script can do.
  const limited = await enforce(LIMITS.COMMENTS, async () => {
    const start = windowStartDate(LIMITS.COMMENTS.windowSec);
    const [r] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.commenterId, userId), gte(comments.createdAt, start)));
    return Number(r?.c ?? 0);
  });
  if (limited) return limited;

  // Confirm the rating exists; FK would catch this but the error is friendlier here.
  const [r] = await db
    .select({ userId: ratings.userId })
    .from(ratings)
    .where(and(eq(ratings.userId, ratingUserId), eq(ratings.songId, songId)))
    .limit(1);
  if (!r) return NextResponse.json({ error: "rating not found" }, { status: 404 });

  // Privacy gate: can the commenter even see this rating? If the owner
  // is private and the commenter doesn't follow, block the comment so we
  // don't let strangers post on private ratings.
  if (!(await canViewRatingsFrom(userId, ratingUserId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Block guard: refuse a comment from someone who's on either side of
  // a block edge with the rating owner. Apple Guideline 1.2 wants the
  // moderation barrier to be real — silently dropping the comment isn't
  // enough; the write itself must fail.
  if (ratingUserId !== userId) {
    const [blockEdge] = await db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, userId), eq(blocks.blockedId, ratingUserId)),
          and(eq(blocks.blockerId, ratingUserId), eq(blocks.blockedId, userId)),
        ),
      )
      .limit(1);
    if (blockEdge) {
      return NextResponse.json({ error: "blocked" }, { status: 403 });
    }
  }

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
  // One block-edge lookup up-front. Used to suppress mention/reply/
  // comment notifications going to anyone the commenter has blocked
  // (or who blocked them) — a blocked user shouldn't be able to ping
  // their target via @mention or by replying to the target's comment.
  const { hiddenSet: notifyBlocked } = await getBlockEdges(userId);

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
          .filter((u) => u.id !== userId && u.id !== ratingUserId && !notifyBlocked.has(u.id))
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
              category: "mention",
            });
          }),
      );
    } catch (e) {
      reportError(e, "comments POST mention notify");
    }
  }

  // Activity + push to the rating owner. For top-level comments, type is
  // 'comment'. For replies, the rating owner still gets one but typed as
  // 'comment' (same UX) — the reply-specific notification goes to the
  // parent comment author below.
  //
  // Fan out actor + song + ratingOwner lookups in parallel — three
  // sequential awaits previously, all independent. Trims 2 DB
  // roundtrips off the POST critical path.
  const [[actor], [song], [ratingOwner]] = await Promise.all([
    db
      .select({ displayName: users.displayName, username: users.username })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ title: songs.title })
      .from(songs)
      .where(eq(songs.id, songId))
      .limit(1),
    db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, ratingUserId))
      .limit(1),
  ]);
  const actorName = actor?.displayName || actor?.username || "Someone";
  const preview = text.length > 80 ? text.slice(0, 77) + "…" : text;
  // Feed-focus URL — works whether or not the recipient follows the
  // rating owner. The ?focus=<userId>:<songId> param forces inclusion.
  const ratingPageUrl = `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`;
  // Keep a /u/<actor> fallback only if we couldn't even resolve the owner.
  const fallbackUrl = ratingOwner
    ? ratingPageUrl
    : `/u/${actor?.username ?? ""}`;

  // Rating-owner activity + push (skipped for self-comments). Fire the
  // DB insert and the push send in parallel — they're independent, and
  // a slow web-push roundtrip was previously blocking the activity row
  // from being written for ~150-300ms longer than necessary. allSettled
  // so a flaky push provider can't roll back the activity row.
  if (ratingUserId !== userId && !notifyBlocked.has(ratingUserId)) {
    // Push batching: if this same commenter posted on this same rating
    // within the last 5 minutes (i.e. they're typing a thread of
    // replies), skip the push. The activity row still goes in so the
    // rating owner sees the new comment on their /activity, but they
    // don't get a string of pings buzzing their phone for what is
    // effectively one conversation.
    const recentWindowMs = 5 * 60 * 1000;
    const recent = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.userId, ratingUserId),
          eq(activities.actorId, userId),
          eq(activities.type, "comment"),
          eq(activities.songId, songId),
          gte(activities.createdAt, new Date(Date.now() - recentWindowMs)),
        ),
      )
      .limit(1);
    const skipPush = recent.length > 0;
    const work: Promise<unknown>[] = [
      db.insert(activities).values({
        id: randomUUID(),
        userId: ratingUserId,
        actorId: userId,
        type: "comment",
        songId,
        ratingUserId,
      }),
    ];
    if (!skipPush) {
      work.push(
        sendPushToUser(ratingUserId, {
          title: `${actorName} commented on ${song?.title ?? "your rating"}`,
          body: preview,
          // Rating owner = recipient: focus-param URL guarantees the
          // card shows on the feed even if pagination would have
          // hidden it.
          url: `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${encodeBase64Url(songId)}`,
          tag: `comment:${userId}:${songId}`,
          category: "comment",
        }),
      );
    }
    await Promise.allSettled(work);
  }

  // If this is a reply, additionally notify the parent comment's author —
  // unless they're the rating owner (already notified above) or themselves.
  // Same parallel pattern as the rating-owner block above.
  if (
    parentCommenterId &&
    parentCommenterId !== userId &&
    parentCommenterId !== ratingUserId &&
    !notifyBlocked.has(parentCommenterId)
  ) {
    try {
      await Promise.allSettled([
        db.insert(activities).values({
          id: randomUUID(),
          userId: parentCommenterId,
          actorId: userId,
          type: "reply",
          songId,
          ratingUserId,
        }),
        sendPushToUser(parentCommenterId, {
          title: `${actorName} replied to your comment`,
          body: preview,
          // Parent commenter isn't necessarily the rating owner, so we
          // can't anchor to their feed — link to the rating's shared page.
          url: fallbackUrl,
          tag: `reply:${userId}:${songId}`,
          category: "comment",
        }),
      ]);
    } catch (e) {
      reportError(e, "comments POST reply notify");
    }
  }

  // Return the new comment with commenter info to avoid a second round-trip.
  // Fetch the author row + the author's rating-on-this-song in parallel —
  // both are needed for the response shape and the two queries are
  // independent. Trims one DB roundtrip off the POST critical path.
  const [meRows, myRatingRows] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ score: ratings.score, review: ratings.review })
      .from(ratings)
      .where(and(eq(ratings.userId, userId), eq(ratings.songId, songId)))
      .limit(1),
  ]);
  const me = meRows[0];
  const myRating = myRatingRows[0];

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
  // If this comment is a thread parent, promote its replies to
  // top-level so the children stay visible. parent_comment_id has no
  // foreign-key constraint, so without this step the replies would
  // become invisible orphans (parentCommentId pointing at a row that
  // no longer exists, while the CommentSection's render path only
  // looks for replies under existing parents). Safe to run when c
  // is itself a reply — there are no grand-children to promote.
  await db
    .update(comments)
    .set({ parentCommentId: null })
    .where(eq(comments.parentCommentId, commentId));
  await db.delete(comments).where(eq(comments.id, commentId));

  // Activity cleanup: if the commenter has no remaining comments on this
  // rating, drop the "X commented on your rating" activity row so the
  // recipient's notification bell doesn't keep linking to a deleted
  // comment. We can't pinpoint the activity row by commentId (the
  // activities schema doesn't carry one), so we use the
  // "no comments left from this actor on this target" check as the
  // signal that the notification is safe to remove. Best-effort.
  if (c.commenterId !== c.ratingUserId) {
    try {
      const remaining = await db
        .select({ id: comments.id })
        .from(comments)
        .where(
          and(
            eq(comments.ratingUserId, c.ratingUserId),
            eq(comments.songId, c.songId),
            eq(comments.commenterId, c.commenterId),
          ),
        )
        .limit(1);
      if (remaining.length === 0) {
        await db
          .delete(activities)
          .where(
            and(
              eq(activities.userId, c.ratingUserId),
              eq(activities.actorId, c.commenterId),
              eq(activities.type, "comment"),
              eq(activities.songId, c.songId),
            ),
          );
      }
    } catch (e) {
      reportError(e, "comments DELETE activity cleanup");
    }
  }

  return NextResponse.json({ ok: true });
}

