import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, activities } from "@/db";
import { reportError } from "@/lib/report-error";

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
    // Log internally — don't return the raw Clerk error message which
    // can leak request IDs, internal endpoint paths, or other config
    // details a hostile client could use to probe.
    reportError(e, "account delete clerk");
    return NextResponse.json({ error: "clerk_delete_failed" }, { status: 502 });
  }

  // 2) Local DB cleanup. Now that Clerk is gone the user is permanently
  //    signed out anyway; orphaning this row is a recoverable state, not a
  //    silent identity hijack.
  //
  // Cascade summary on `users.id` delete: ratings, comments, likes,
  // follows, recommendations, dismissed_suggestions, push_subscriptions,
  // and activities WHERE userId OR actorId match all cascade-delete
  // automatically. But activities.ratingUserId is a plain
  // text column (no FK), so rows like "Bob commented on this user's
  // rating, mentioning Wendy" survive in Wendy's bell with a dangling
  // ratingUserId pointer that resolves to a now-deleted user — same
  // ghost-notification class we fixed for the single-rating DELETE in
  // Wave S. Sweep those before the user-row delete (best-effort).
  try {
    await db
      .delete(activities)
      .where(eq(activities.ratingUserId, userId));
  } catch {
    /* non-critical — proceed with the user-row delete either way */
  }
  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (e) {
    // Clerk already deleted — user is signed out either way, so return
    // 200. Surface the DB issue via reportError + Sentry rather than
    // echoing the raw message back, which could leak Postgres internals.
    reportError(e, "account delete db");
    return NextResponse.json({ ok: true, dbCleanupPending: true });
  }

  return NextResponse.json({ ok: true });
}
