import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

export const runtime = "nodejs";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
