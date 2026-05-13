import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, reports } from "@/db";
import { reportError } from "@/lib/report-error";

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
// Body: { status: "reviewed" | "dismissed" }
// Marks a report row resolved so it drops out of the /admin/reports
// queue. Apple expects we act on reports within 24 hours; this endpoint
// is how the queue is actually drained.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!isAdmin(userId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const status = (body as { status?: string })?.status;
  if (status !== "reviewed" && status !== "dismissed") {
    return NextResponse.json({ error: "bad_status" }, { status: 400 });
  }

  try {
    await db.update(reports).set({ status }).where(eq(reports.id, id));
  } catch (e) {
    reportError(e, "admin report PATCH");
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
