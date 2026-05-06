import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

export const runtime = "nodejs";

// Deletes both the Clerk account and the local user row. Cascades clean up
// ratings, comments, likes, follows, activities. The Netlify DB FKs are all
// ON DELETE CASCADE so a single users.delete tears the rest down.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1) Local DB cleanup. Doing this first so a Clerk-deletion failure leaves
  //    less inconsistent state.
  await db.delete(users).where(eq(users.id, userId));

  // 2) Clerk-side delete.
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (e) {
    // The local row is already gone; report the partial state.
    return NextResponse.json(
      { ok: true, clerkError: (e as Error).message },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true });
}
