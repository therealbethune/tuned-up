import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, follows, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

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
    await db
      .insert(follows)
      .values({ followerId: userId, followeeId: target.id })
      .onConflictDoNothing();
  }

  return NextResponse.json({ ok: true });
}
