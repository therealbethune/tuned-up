import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, reports, ratings, comments, activities } from "@/db";
import { reportError } from "@/lib/report-error";
import { memoryRateLimited, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const allow = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(userId);
}

// POST /api/admin/reports/:id
// Body: { status: "reviewed" | "dismissed", removeContent?: boolean }
//
// Marks a report row resolved so it drops out of the /admin/reports
// queue. If `removeContent` is true, also deletes the underlying
// reported content (rating or comment) so the moderator doesn't need
// a second round-trip. App Store Guideline 1.2 expects we act on
// reports within 24 hours; this endpoint is how the queue is drained.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!isAdmin(userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const limited = memoryRateLimited(LIMITS.ACCOUNT, `admin-reports:${userId}`);
  if (limited) return limited;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const status = (body as { status?: string })?.status;
  const removeContent = (body as { removeContent?: boolean })?.removeContent === true;
  if (status !== "reviewed" && status !== "dismissed") {
    return NextResponse.json({ error: "bad_status" }, { status: 400 });
  }

  // Load the report so we know what to delete (if requested).
  const [report] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!report) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (removeContent) {
    try {
      if (report.targetType === "comment" && report.targetCommentId) {
        // Drop the offending comment + any activity rows that point at it.
        await db.delete(comments).where(eq(comments.id, report.targetCommentId));
      } else if (report.targetType === "rating" && report.targetUserId && report.targetSongId) {
        // Deleting the rating cascades to its likes + comments via the
        // existing FK. Also clean the activity rows that point at it
        // by (ratingUserId) — same sweep pattern the rating-delete API uses.
        await db.delete(ratings).where(
          and(eq(ratings.userId, report.targetUserId), eq(ratings.songId, report.targetSongId)),
        );
        try {
          await db
            .delete(activities)
            .where(
              and(
                eq(activities.ratingUserId, report.targetUserId),
                eq(activities.songId, report.targetSongId),
              ),
            );
        } catch {
          /* non-critical activity sweep */
        }
      }
      // No automatic action for targetType="user" — banning is too
      // destructive to do via this endpoint; the moderator should
      // handle a hostile user through the Clerk dashboard.
    } catch (e) {
      reportError(e, "admin report content delete");
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }
  }

  try {
    await db.update(reports).set({ status }).where(eq(reports.id, id));
  } catch (e) {
    reportError(e, "admin report status update");
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: removeContent });
}
