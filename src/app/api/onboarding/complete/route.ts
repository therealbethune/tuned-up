import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

export const runtime = "nodejs";

// Idempotent — only stamps onboardedAt the FIRST time. Re-calls are no-ops
// so cohort analytics ("users onboarded in week X") stay accurate.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  await db
    .update(users)
    .set({ onboardedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.onboardedAt)));

  return NextResponse.json({ ok: true });
}
