import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, users, follows, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { isPrivate } = (await req.json().catch(() => ({}))) ?? {};
  if (typeof isPrivate !== "boolean") {
    return NextResponse.json({ error: "isPrivate must be boolean" }, { status: 400 });
  }
  await db.update(users).set({ isPrivate }).where(eq(users.id, userId));

  // When a user flips from private → public, auto-accept any pending
  // follow requests they had received. Otherwise those requests sit
  // pending forever: the would-be follower already sees themselves as
  // having requested, and the now-public user's Activity bell would
  // still show stale "wants to follow" rows even though anyone can
  // already follow them without approval. The request UX is meaningless
  // once the account is public — collapse all pending → accepted.
  if (isPrivate === false) {
    try {
      const accepted = await db
        .update(follows)
        .set({ status: "accepted" })
        .where(and(eq(follows.followeeId, userId), eq(follows.status, "pending")))
        .returning({ followerId: follows.followerId });
      if (accepted.length > 0) {
        for (const f of accepted) {
          await db
            .delete(activities)
            .where(
              and(
                eq(activities.userId, userId),
                eq(activities.actorId, f.followerId),
                eq(activities.type, "follow_request"),
              ),
            );
          await db
            .insert(activities)
            .values({
              id: randomUUID(),
              userId,
              actorId: f.followerId,
              type: "follow",
            })
            .onConflictDoNothing();
        }
      }
    } catch (e) {
      // Don't fail the privacy flip if the follow-accept sweep errors;
      // the user's main intent (becoming public) already succeeded.
      reportError(e, "privacy auto-accept pending follows");
    }
  }

  return NextResponse.json({ ok: true, isPrivate });
}
