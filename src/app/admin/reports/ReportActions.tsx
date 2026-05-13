"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

// Inline action buttons on each /admin/reports row. Lets a moderator
// resolve a report in one tap:
//   * "Delete + reviewed" → removes the offending rating/comment AND
//     marks the row reviewed. Only enabled for content reports.
//   * "Mark reviewed" → resolves without deleting.
//   * "Dismiss" → resolves as a false alarm.
// Page refreshes on success so the row disappears.
export function ReportActions({
  reportId,
  targetType,
}: {
  reportId: string;
  targetType: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"delete" | "reviewed" | "dismissed" | null>(null);
  const canDelete = targetType === "rating" || targetType === "comment";

  async function call(action: { status: "reviewed" | "dismissed"; removeContent?: boolean }) {
    const tag = action.removeContent ? "delete" : action.status;
    setBusy(tag);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't update report");
        return;
      }
      toast.success(
        action.removeContent
          ? "Removed content + report closed."
          : action.status === "reviewed"
            ? "Marked reviewed."
            : "Dismissed.",
      );
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canDelete && (
        <button
          onClick={() => call({ status: "reviewed", removeContent: true })}
          disabled={busy !== null}
          className="rounded-full bg-red-500 hover:bg-red-400 text-white text-xs font-semibold px-3 py-1.5 min-h-8 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
        >
          {busy === "delete" ? "…" : `Delete ${targetType}`}
        </button>
      )}
      <button
        onClick={() => call({ status: "reviewed" })}
        disabled={busy !== null}
        className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 min-h-8 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        {busy === "reviewed" ? "…" : "Mark reviewed"}
      </button>
      <button
        onClick={() => call({ status: "dismissed" })}
        disabled={busy !== null}
        className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-xs px-3 py-1.5 min-h-8 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        {busy === "dismissed" ? "…" : "Dismiss"}
      </button>
    </div>
  );
}
