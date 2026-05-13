import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { isValidCoverTheme } from "@/lib/cover-themes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/account/cover
// Body: { theme: string | null }   // null resets to default emerald.
//
// Constrained to the curated COVER_THEMES list — anything off-palette
// is rejected so we don't have to moderate user uploads.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) ?? {};
  const theme = body.theme === null ? null : body.theme;
  if (theme !== null && !isValidCoverTheme(theme)) {
    return NextResponse.json({ error: "bad_theme" }, { status: 400 });
  }
  await db.update(users).set({ coverTheme: theme }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true, theme });
}
