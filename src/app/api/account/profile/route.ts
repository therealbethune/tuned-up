import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq, ne, and } from "drizzle-orm";
import { db, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";

export const runtime = "nodejs";

const USERNAME_RX = /^[a-z0-9_]{3,24}$/;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await syncCurrentUser();

  const { username, displayName } = (await req.json().catch(() => ({}))) ?? {};
  const updates: { username?: string; displayName?: string } = {};

  if (typeof username === "string" && username.length > 0) {
    const u = username.trim().toLowerCase();
    if (!USERNAME_RX.test(u)) {
      return NextResponse.json(
        { error: "Username must be 3-24 chars: lowercase letters, numbers, underscores." },
        { status: 400 },
      );
    }
    // Uniqueness (case-insensitive — usernames are stored lowercased above).
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, u), ne(users.id, userId)))
      .limit(1);
    if (taken) {
      return NextResponse.json({ error: "Username is taken" }, { status: 409 });
    }
    updates.username = u;
  }

  if (typeof displayName === "string") {
    const d = displayName.trim().slice(0, 60);
    updates.displayName = d;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  // Best-effort sync to Clerk (so syncCurrentUser doesn't immediately overwrite).
  try {
    const client = await clerkClient();
    const u: Record<string, string> = {};
    if (updates.username) u.username = updates.username;
    if (updates.displayName) {
      const parts = updates.displayName.split(/\s+/);
      u.firstName = parts[0] ?? "";
      u.lastName = parts.slice(1).join(" ") ?? "";
    }
    if (Object.keys(u).length > 0) {
      await client.users.updateUser(userId, u);
    }
  } catch {
    // Clerk update is best-effort; the local DB is the source of truth for the
    // app. If Clerk rejects (e.g. username already taken on its side), our row
    // still wins and syncCurrentUser will gently push it next time.
  }

  return NextResponse.json({ ok: true, ...updates });
}
