import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, activities } from "@/db";

export const runtime = "nodejs";

// Mark all of the current user's activities as read.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db
    .update(activities)
    .set({ readAt: new Date() })
    .where(and(eq(activities.userId, userId), isNull(activities.readAt)));

  return NextResponse.json({ ok: true });
}
