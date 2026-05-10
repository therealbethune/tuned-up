import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

export const runtime = "nodejs";

// Deletes both the Clerk account and the local user row. Cascades clean up
// ratings, comments, likes, follows, activities (FKs are ON DELETE CASCADE).
//
// Order: Clerk FIRST, then local DB.
//   - If Clerk fails, we abort and the user can retry — both states still
//     exist consistently.
//   - If Clerk succeeds but DB fails, the user is signed out of Clerk and
//     the next signed-in lookup will see the orphan row and either
//     gracefully ignore or get cleaned up by a sweep.
//   - The reverse order (DB first) was worse: a partial failure orphaned
//     a Clerk account whose DB row was already gone — login would create
//     a fresh empty profile under the same Clerk id with no warning.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Clerk delete. If this fails, surface it and keep all DB data intact
  //    so the user can retry.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (e) {
    return NextResponse.json(
      { error: "clerk delete failed", message: (e as Error).message },
      { status: 502 },
    );
  }

  // 2) Local DB cleanup. Now that Clerk is gone the user is permanently
  //    signed out anyway; orphaning this row is a recoverable state, not a
  //    silent identity hijack.
  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (e) {
    return NextResponse.json(
      { ok: true, dbError: (e as Error).message },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true });
}
