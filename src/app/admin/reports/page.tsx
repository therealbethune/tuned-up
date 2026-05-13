import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db, reports, users, comments } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { encodeBase64Url } from "@/lib/encoding";
import { ReportActions } from "./ReportActions";

export const dynamic = "force-dynamic";

// Minimal moderation queue. Gated by ADMIN_USER_IDS (comma-separated
// Clerk user ids in the env). Apple expects us to act on reports
// within 24 hours; this page is how a human does that fastest.
// Returns 404 for anyone not in the allowlist so the route doesn't
// leak even by URL guessing.
function isAdmin(userId: string | null): boolean {
  if (!userId) return false;
  const allow = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allow.includes(userId);
}

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate: "Hate",
  sexual: "Sexual",
  violence: "Violence",
  self_harm: "Self-harm",
  impersonation: "Impersonation",
  other: "Other",
};

export default async function AdminReportsPage() {
  const { userId } = await auth();
  if (!isAdmin(userId)) notFound();

  const rows = await safeQuery(
    () =>
      db
        .select()
        .from(reports)
        .where(eq(reports.status, "open"))
        .orderBy(desc(reports.createdAt))
        .limit(100),
    [] as (typeof reports.$inferSelect)[],
    "admin-reports",
  );

  // Pull commenter usernames + reported-user usernames + comment bodies
  // in one pass for context. All best-effort.
  const reporterIds = Array.from(new Set(rows.map((r) => r.reporterId)));
  const subjectIds = Array.from(
    new Set(rows.map((r) => r.targetUserId).filter((id): id is string => Boolean(id))),
  );
  const commentIds = Array.from(
    new Set(rows.map((r) => r.targetCommentId).filter((id): id is string => Boolean(id))),
  );
  const [reporterRows, subjectRows, commentRows] = await Promise.all([
    reporterIds.length
      ? safeQuery(
          () =>
            db
              .select({ id: users.id, username: users.username })
              .from(users)
              .where(inArray(users.id, reporterIds)),
          [] as { id: string; username: string }[],
          "admin-reports-reporters",
        )
      : Promise.resolve([] as { id: string; username: string }[]),
    subjectIds.length
      ? safeQuery(
          () =>
            db
              .select({ id: users.id, username: users.username })
              .from(users)
              .where(inArray(users.id, subjectIds)),
          [] as { id: string; username: string }[],
          "admin-reports-subjects",
        )
      : Promise.resolve([] as { id: string; username: string }[]),
    commentIds.length
      ? safeQuery(
          () =>
            db
              .select({ id: comments.id, body: comments.body })
              .from(comments)
              .where(inArray(comments.id, commentIds)),
          [] as { id: string; body: string }[],
          "admin-reports-comments",
        )
      : Promise.resolve([] as { id: string; body: string }[]),
  ]);
  const reporters = new Map(reporterRows.map((r) => [r.id, r.username]));
  const subjects = new Map(subjectRows.map((r) => [r.id, r.username]));
  const commentBodies = new Map(commentRows.map((c) => [c.id, c.body]));

  return (
    <div className="space-y-5">
      <header className="flex items-baseline gap-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <span className="text-sm text-neutral-400 tabular-nums">{rows.length} open</span>
      </header>

      {rows.length === 0 ? (
        <p className="text-neutral-400">Queue clear. Nice.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const reporter = reporters.get(r.reporterId) ?? r.reporterId;
            const subject = r.targetUserId
              ? subjects.get(r.targetUserId) ?? r.targetUserId
              : null;
            const commentBody = r.targetCommentId
              ? commentBodies.get(r.targetCommentId)
              : null;
            const ratingHref =
              r.targetType === "rating" && r.targetUserId && r.targetSongId
                ? `/r/${subject ?? r.targetUserId}/${encodeBase64Url(r.targetSongId)}`
                : null;
            const subjectHref = subject ? `/u/${subject}` : null;
            return (
              <li
                key={r.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs text-neutral-400 flex-wrap">
                  <span className="text-emerald-400 font-medium">
                    {REASON_LABELS[r.reason] ?? r.reason}
                  </span>
                  <span>·</span>
                  <span>{r.targetType}</span>
                  <span>·</span>
                  <span>@{reporter}</span>
                  <span>·</span>
                  <time dateTime={r.createdAt.toISOString()}>
                    {r.createdAt.toLocaleString()}
                  </time>
                </div>
                {subjectHref && (
                  <div className="text-sm">
                    Subject:{" "}
                    <Link href={subjectHref} className="text-white hover:underline">
                      @{subject}
                    </Link>
                  </div>
                )}
                {ratingHref && (
                  <div className="text-sm">
                    <Link href={ratingHref} className="text-sky-300 hover:underline">
                      Open rating →
                    </Link>
                  </div>
                )}
                {commentBody && (
                  <blockquote className="text-sm text-neutral-300 border-l-2 border-neutral-700 pl-3 whitespace-pre-wrap break-words">
                    {commentBody}
                  </blockquote>
                )}
                {r.details && (
                  <p className="text-sm text-neutral-400">
                    Note: <span className="text-neutral-200">{r.details}</span>
                  </p>
                )}
                <div className="pt-1">
                  <ReportActions reportId={r.id} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="pt-4 text-xs text-neutral-500">
        Apple expects we act on reports within 24 hours. Use the
        per-row action buttons to mark the row reviewed (action taken)
        or dismissed (false alarm) once you&apos;ve handled the
        underlying content.
      </p>
    </div>
  );
}
