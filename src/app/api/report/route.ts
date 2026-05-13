import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, reports } from "@/db";
import { enforce, LIMITS, windowStartDate } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/report
// Body: { targetType: "rating"|"comment"|"user",
//         targetUserId?: string, targetSongId?: string, targetCommentId?: string,
//         reason: string, details?: string }
//
// UGC moderation per Apple App Store Guideline 1.2 — users must be
// able to flag offensive content. We persist the report; staff act
// on it via /admin/reports.
const VALID_REASONS = new Set([
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "self_harm",
  "impersonation",
  "other",
]);

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limited = await enforce(LIMITS.REPORTS, async () => {
    const [row] = await db
      .select({ n: count() })
      .from(reports)
      .where(
        and(
          eq(reports.reporterId, userId),
          gte(reports.createdAt, windowStartDate(LIMITS.REPORTS.windowSec)),
        ),
      );
    return Number(row?.n ?? 0);
  });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const targetType = typeof b.targetType === "string" ? b.targetType : "";
  const reason = typeof b.reason === "string" ? b.reason : "";
  const details =
    typeof b.details === "string" ? b.details.slice(0, 500) : null;
  const targetUserId =
    typeof b.targetUserId === "string" ? b.targetUserId : null;
  const targetSongId =
    typeof b.targetSongId === "string" ? b.targetSongId : null;
  const targetCommentId =
    typeof b.targetCommentId === "string" ? b.targetCommentId : null;

  if (!["rating", "comment", "user"].includes(targetType)) {
    return NextResponse.json({ error: "bad_target_type" }, { status: 400 });
  }
  if (!VALID_REASONS.has(reason)) {
    return NextResponse.json({ error: "bad_reason" }, { status: 400 });
  }
  // Each target type has different required pointers; reject obvious
  // mismatches so we don't end up with orphan rows in the admin view.
  if (targetType === "rating" && (!targetUserId || !targetSongId)) {
    return NextResponse.json({ error: "missing_rating_target" }, { status: 400 });
  }
  if (targetType === "comment" && !targetCommentId) {
    return NextResponse.json({ error: "missing_comment_id" }, { status: 400 });
  }
  if (targetType === "user" && !targetUserId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  // De-dupe: ignore (silently 200) if this user already reported the
  // same target. Keeps the queue clean without surfacing an error UI.
  const dup = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, userId),
        eq(reports.targetType, targetType),
        targetCommentId
          ? eq(reports.targetCommentId, targetCommentId)
          : targetSongId && targetUserId
            ? and(
                eq(reports.targetSongId, targetSongId),
                eq(reports.targetUserId, targetUserId),
              )!
            : eq(reports.targetUserId, targetUserId!),
      ),
    )
    .limit(1);
  if (dup.length > 0) {
    return NextResponse.json({ ok: true, dedup: true });
  }

  try {
    await db.insert(reports).values({
      id: randomUUID(),
      reporterId: userId,
      targetType,
      targetUserId,
      targetSongId,
      targetCommentId,
      reason,
      details,
    });
  } catch (e) {
    reportError(e, "report POST insert");
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
