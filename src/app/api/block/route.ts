import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { db, blocks, follows } from "@/db";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/block
// Body: { targetId: string, action: "block" | "unblock" }
//
// Block flow per App Store Guideline 1.2. Blocking is one-way from
// the viewer's perspective but mirrored in content filters: blocked
// users disappear from the blocker's feed, and the blocker disappears
// from the blocked user's feed (so the abuser doesn't see they were
// muted and target a new account). Also drops any existing follows in
// both directions so the bond is severed cleanly.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const targetId = typeof b.targetId === "string" ? b.targetId : "";
  const action = b.action === "unblock" ? "unblock" : "block";

  if (!targetId || targetId === userId) {
    return NextResponse.json({ error: "bad_target" }, { status: 400 });
  }

  const limited = await enforce(LIMITS.BLOCKS, async () => {
    const [row] = await db
      .select({ n: count() })
      .from(blocks)
      .where(
        and(
          eq(blocks.blockerId, userId),
          gte(blocks.createdAt, windowStartDate(LIMITS.BLOCKS.windowSec)),
        ),
      );
    return Number(row?.n ?? 0);
  });
  if (limited) return limited;

  try {
    if (action === "unblock") {
      await db
        .delete(blocks)
        .where(and(eq(blocks.blockerId, userId), eq(blocks.blockedId, targetId)));
      return NextResponse.json({ ok: true, blocked: false });
    }

    // Block: insert (idempotent via composite PK), then drop follows in
    // both directions. Best-effort on the follow cleanup — the block
    // alone is enough to hide content.
    await db
      .insert(blocks)
      .values({ blockerId: userId, blockedId: targetId })
      .onConflictDoNothing();
    try {
      await db
        .delete(follows)
        .where(
          and(eq(follows.followerId, userId), eq(follows.followeeId, targetId)),
        );
      await db
        .delete(follows)
        .where(
          and(eq(follows.followerId, targetId), eq(follows.followeeId, userId)),
        );
    } catch (e) {
      reportError(e, "block POST follow cleanup");
    }
    return NextResponse.json({ ok: true, blocked: true });
  } catch (e) {
    reportError(e, "block POST");
    return NextResponse.json({ error: "block_failed" }, { status: 500 });
  }
}
