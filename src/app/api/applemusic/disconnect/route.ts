import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, appleMusicConnections, listeningHistory } from "@/db";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/applemusic/disconnect
//
// Removes the user's Apple Music link + drops their cached
// listening history so a disconnect feels like the listening data is
// really gone — not just hidden behind a UI flag.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await db
      .delete(appleMusicConnections)
      .where(eq(appleMusicConnections.userId, userId));
    // Best-effort cleanup of the history rows. Provider-scoped so
    // future SoundCloud / Spotify connections aren't affected.
    await db
      .delete(listeningHistory)
      .where(
        and(
          eq(listeningHistory.userId, userId),
          eq(listeningHistory.provider, "apple_music"),
        ),
      );
  } catch (e) {
    reportError(e, "applemusic disconnect");
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
