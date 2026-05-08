import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, spotifyAccounts } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/spotify/account — returns the viewer's link state.
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ connected: false });

  const [row] = await db
    .select({
      spotifyUserId: spotifyAccounts.spotifyUserId,
      scope: spotifyAccounts.scope,
      connectedAt: spotifyAccounts.connectedAt,
    })
    .from(spotifyAccounts)
    .where(eq(spotifyAccounts.userId, userId));

  if (!row) return NextResponse.json({ connected: false });
  return NextResponse.json({
    connected: true,
    spotifyUserId: row.spotifyUserId,
    scope: row.scope,
    connectedAt: row.connectedAt,
  });
}

// DELETE /api/spotify/account — disconnect.
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.delete(spotifyAccounts).where(eq(spotifyAccounts.userId, userId));
  return NextResponse.json({ ok: true });
}
