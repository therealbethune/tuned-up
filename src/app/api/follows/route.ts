import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, follows, users, activities } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { username, action } = (await req.json()) ?? {};
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: "cannot follow yourself" }, { status: 400 });

  if (action === "unfollow") {
    await db.delete(follows).where(and(eq(follows.followerId, userId), eq(follows.followeeId, target.id)));
  } else {
    const inserted = await db
      .insert(follows)
      .values({ followerId: userId, followeeId: target.id })
      .onConflictDoNothing()
      .returning({ followerId: follows.followerId });

    // Only generate an activity for a *new* follow (not duplicate calls).
    if (inserted.length > 0) {
      // Clear any prior follow-activity from this actor to avoid stale entries
      // when the user unfollowed and re-followed.
      await db
        .delete(activities)
        .where(
          and(
            eq(activities.userId, target.id),
            eq(activities.actorId, userId),
            eq(activities.type, "follow"),
          ),
        );
      await db.insert(activities).values({
        id: randomUUID(),
        userId: target.id,
        actorId: userId,
        type: "follow",
      });
    }
  }

  return NextResponse.json({ ok: true });
}
