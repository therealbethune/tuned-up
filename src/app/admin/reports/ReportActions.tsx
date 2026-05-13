"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

// Inline "Mark reviewed" / "Dismiss" buttons on each /admin/reports
// row. Marking a report resolves it (status → reviewed|dismissed) so it
// drops out of the open queue. Page is refreshed so the row disappears.
export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"reviewed" | "dismissed" | null>(null);

  async function act(status: "reviewed" | "dismissed") {
    setBusy(status);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't update report");
        return;
      }
      toast.success(status === "reviewed" ? "Marked reviewed." : "Dismissed.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act("reviewed")}
        disabled={busy !== null}
        className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 min-h-8 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      >
        {busy === "reviewed" ? "…" : "Mark reviewed"}
      </button>
      <button
        onClick={() => act("dismissed")}
        disabled={busy !== null}
        className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-xs px-3 py-1.5 min-h-8 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
      >
        {busy === "dismissed" ? "…" : "Dismiss"}
      </button>
    </div>
  );
}
