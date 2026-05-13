import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, gte, sql, or } from "drizzle-orm";
import { db, follows, users, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { randomUUID } from "node:crypto";
import { sendPushToUser } from "@/lib/push";
import { blocks } from "@/db";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Body: { username, action?: 'follow' | 'unfollow' | 'accept' | 'reject' }
// 'accept' / 'reject' are run by the *target* of a pending follow request.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  // Guard against malformed JSON bodies — `await req.json()` without a
  // catch throws a 500 instead of returning 400.
  const { username, action } = (await req.json().catch(() => null)) ?? {};
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });

  // accept/reject: viewer is the followee, the actor (in URL) is the requester
  if (action === "accept" || action === "reject") {
    // For accept/reject the viewer is the *target* of the request; `username`
    // identifies the *follower*.
    if (target.id === userId) {
      return NextResponse.json({ error: "use a follower's username, not your own" }, { status: 400 });
    }
    if (action === "accept") {
      // Only update if a pending request actually exists from this user.
      // RETURNING tells us whether anything was affected; if not, we DON'T
      // forge a "follow" activity out of thin air.
      const updated = await db
        .update(follows)
        .set({ status: "accepted" })
        .where(and(eq(follows.followerId, target.id), eq(follows.followeeId, userId), eq(follows.status, "pending")))
        .returning({ followerId: follows.followerId });
      if (updated.length === 0) {
        return NextResponse.json({ error: "no pending request from this user" }, { status: 404 });
      }
      // Convert the request activity into a regular follow notification.
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.actorId, target.id),
            eq(activities.type, "follow_request"),
          ),
        );
      await db.insert(activities).values({
        id: randomUUID(),
        userId: userId,
        actorId: target.id,
        type: "follow",
      });
    } else {
      await db
        .delete(follows)
        .where(and(eq(follows.followerId, target.id), eq(follows.followeeId, userId), eq(follows.status, "pending")));
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, userId),
            eq(activities.actorId, target.id),
            eq(activities.type, "follow_request"),
          ),
        );
    }
    return NextResponse.json({ ok: true });
  }

  if (target.id === userId) {
    return NextResponse.json({ error: "cannot follow yourself" }, { status: 400 });
  }

  // Block guard: a blocked user attempting to follow their target
  // would otherwise quietly drop a fresh follow row + notification.
  // Refuse the action on either side of the block edge.
  if (action !== "unfollow") {
    const [edge] = await db
      .select({ blockerId: blocks.blockerId })
      .from(blocks)
      .where(
        or(
          and(eq(blocks.blockerId, userId), eq(blocks.blockedId, target.id)),
          and(eq(blocks.blockerId, target.id), eq(blocks.blockedId, userId)),
        ),
      )
      .limit(1);
    if (edge) {
      return NextResponse.json({ error: "blocked" }, { status: 403 });
    }
  }

  // Rate-limit follow creates only — accept/reject/unfollow can't be
  // used to harass (they require an existing edge), so they're skipped
  // above. This stops follow-spam-as-notification-bomb where someone
  // floods their target with follow_request pushes.
  if (action !== "unfollow") {
    const limited = await enforce(LIMITS.FOLLOWS, async () => {
      const start = windowStartDate(LIMITS.FOLLOWS.windowSec);
      const [r] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(follows)
        .where(and(eq(follows.followerId, userId), gte(follows.createdAt, start)));
      return Number(r?.c ?? 0);
    });
    if (limited) return limited;
  }

  if (action === "unfollow") {
    await db
      .delete(follows)
      .where(and(eq(follows.followerId, userId), eq(follows.followeeId, target.id)));
    return NextResponse.json({ ok: true });
  }

  // Follow (or follow-request, depending on whether target is private).
  const status = target.isPrivate ? "pending" : "accepted";
  const inserted = await db
    .insert(follows)
    .values({ followerId: userId, followeeId: target.id, status })
    .onConflictDoNothing()
    .returning({ followerId: follows.followerId });

  if (inserted.length > 0) {
    // Run the activity replacement (delete-then-insert) and the actor
    // lookup in parallel — the activity work doesn't depend on the
    // actor's display name and the actor lookup doesn't depend on the
    // activity row. We need actor.username for the push URL, so the
    // push waits for that branch.
    const activityType = status === "pending" ? "follow_request" : "follow";
    const [, [actor]] = await Promise.all([
      (async () => {
        await db
          .delete(activities)
          .where(
            and(
              eq(activities.userId, target.id),
              eq(activities.actorId, userId),
              eq(activities.type, activityType),
            ),
          );
        await db.insert(activities).values({
          id: randomUUID(),
          userId: target.id,
          actorId: userId,
          type: activityType,
        });
      })(),
      db
        .select({ displayName: users.displayName, username: users.username })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    ]);

    const actorName = actor?.displayName || actor?.username || "Someone";
    await sendPushToUser(target.id, {
      title: status === "pending" ? `${actorName} wants to follow you` : `${actorName} followed you`,
      body: status === "pending" ? "Approve them in Activity." : "View their profile in the app.",
      url: status === "pending" ? "/activity" : `/u/${actor?.username ?? ""}`,
      tag: `follow:${userId}`,
    });
  }

  return NextResponse.json({ ok: true, status });
}
