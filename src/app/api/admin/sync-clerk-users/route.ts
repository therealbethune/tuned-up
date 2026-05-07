import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db, users } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirror every Clerk user into our local users table. Idempotent — only
// inserts users that don't yet exist locally; never overwrites existing rows.
//
// Usage:
//   curl -X POST https://tuned-up.com/api/admin/sync-clerk-users \
//     -H "Authorization: Bearer $ADMIN_TOKEN"
//
// Auth: requires either Bearer ADMIN_TOKEN, or a signed-in Clerk session whose
// userId is listed in ADMIN_USER_IDS (comma-separated env var).
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const inserted: { id: string; username: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];

  // Page through Clerk's user list (max 500/page).
  let offset = 0;
  const pageSize = 500;
  for (;;) {
    const { data: page } = await client.users.getUserList({
      limit: pageSize,
      offset,
    });
    if (page.length === 0) break;

    // Find which of these already exist in our DB.
    const ids = page.map((u) => u.id);
    const existing = ids.length
      ? await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))
      : [];
    const existingSet = new Set(existing.map((r) => r.id));

    for (const u of page) {
      if (existingSet.has(u.id)) {
        skipped.push({ id: u.id, reason: "already exists" });
        continue;
      }
      const username =
        u.username ||
        u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
        `user_${u.id.slice(-6)}`;
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;
      try {
        await db
          .insert(users)
          .values({
            id: u.id,
            username,
            displayName,
            imageUrl: u.imageUrl ?? null,
          })
          // If the username clashes with an existing one, fall back to a
          // user_XXXXXX form to avoid a 500.
          .onConflictDoNothing();

        // Verify we actually inserted (a username collision could have been
        // caught by the unique index, returning silently). Try again with a
        // unique fallback name if needed.
        const [check] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, u.id))
          .limit(1);
        if (!check) {
          await db.insert(users).values({
            id: u.id,
            username: `user_${u.id.slice(-6)}_${Math.floor(Math.random() * 9999)}`,
            displayName,
            imageUrl: u.imageUrl ?? null,
          });
          inserted.push({ id: u.id, username: `user_${u.id.slice(-6)}*` });
        } else {
          inserted.push({ id: u.id, username });
        }
      } catch (e) {
        skipped.push({ id: u.id, reason: (e as Error).message });
      }
    }

    if (page.length < pageSize) break;
    offset += pageSize;
  }

  // Optional: report total local user count for sanity.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  return NextResponse.json({
    inserted: inserted.length,
    skipped: skipped.length,
    total_local_users: Number(count),
    sample_inserted: inserted.slice(0, 10),
  });
}

async function isAuthorized(req: Request): Promise<boolean> {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (expectedToken) {
    const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (got === expectedToken) return true;
  }
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (adminIds.length) {
    const { userId } = await auth();
    if (userId && adminIds.includes(userId)) return true;
  }
  return false;
}
