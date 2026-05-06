import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

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
  return NextResponse.json({ ok: true, isPrivate });
}
