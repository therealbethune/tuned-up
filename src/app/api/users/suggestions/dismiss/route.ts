import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users, dismissedSuggestions } from "@/db";

export const runtime = "nodejs";

// Body: { username }
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { username } = (await req.json().catch(() => ({}))) ?? {};
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) return NextResponse.json({ error: "user not found" }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: "cannot dismiss yourself" }, { status: 400 });

  await db
    .insert(dismissedSuggestions)
    .values({ viewerId: userId, suggestedId: target.id })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true });
}
