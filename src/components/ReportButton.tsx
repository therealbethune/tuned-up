"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { toast } from "@/lib/toast";

// Tiny "Report" affordance that opens a reason-picker modal. Used on
// rating cards, comments, and user profiles to satisfy App Store
// Guideline 1.2 — every UGC surface needs a way to flag offensive
// content.
//
// Props identify the target. The API resolves which fields are
// required based on `targetType`:
//   rating  → targetUserId + targetSongId
//   comment → targetCommentId (+ targetUserId for the rating owner)
//   user    → targetUserId

export type ReportTarget =
  | { type: "rating"; targetUserId: string; targetSongId: string }
  | { type: "comment"; targetCommentId: string; targetUserId: string; targetSongId: string }
  | { type: "user"; targetUserId: string };

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "sexual", label: "Sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "self_harm", label: "Self-harm" },
  { value: "impersonation", label: "Impersonation" },
  { value: "other", label: "Something else" },
];

export function ReportButton({
  target,
  className,
  label = "Report",
  compact = false,
}: {
  target: ReportTarget;
  className?: string;
  label?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useScrollLock(open);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setShow(true));
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && !busy) close();
      }
      document.addEventListener("keydown", onKey);
      return () => {
        cancelAnimationFrame(id);
        document.removeEventListener("keydown", onKey);
      };
    } else {
      setShow(false);
    }
    // close() is stable and the dep array is intentionally just [open]
    // so it re-runs once per show/hide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  function close() {
    if (busy) return;
    setOpen(false);
    setReason("");
    setDetails("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    const body: Record<string, unknown> = {
      targetType: target.type,
      reason,
      details: details.trim() || undefined,
    };
    if (target.type === "rating") {
      body.targetUserId = target.targetUserId;
      body.targetSongId = target.targetSongId;
    } else if (target.type === "comment") {
      body.targetCommentId = target.targetCommentId;
      body.targetUserId = target.targetUserId;
      body.targetSongId = target.targetSongId;
    } else {
      body.targetUserId = target.targetUserId;
    }
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't send report");
        return;
      }
      toast.success("Report sent. Thanks for keeping Tuned Up clean.");
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={
          className ??
          (compact
            ? "inline-flex items-center justify-center h-9 w-9 min-h-9 min-w-9 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800 active:scale-95 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            : "inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-red-400 px-2 py-1 rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40")
        }
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M4 4v17" strokeLinecap="round" />
          <path d="M4 4h12l-2 4 2 4H4" strokeLinejoin="round" />
        </svg>
        {!compact && <span>{label}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-title"
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-opacity duration-200 ${
            show ? "bg-black/60 backdrop-blur-sm" : "bg-black/0"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={`w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 transform transition-transform duration-200 ease-out ${
              show ? "translate-y-0" : "translate-y-full sm:translate-y-2"
            }`}
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
          >
            <div>
              <h2 id="report-title" className="text-base font-semibold">Report this {target.type === "user" ? "user" : target.type}</h2>
              <p className="text-xs text-neutral-400 mt-1">
                Tell us what&apos;s wrong. Our team reviews every report.
              </p>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition ${
                    reason === r.value
                      ? "border-emerald-500/60 bg-emerald-500/10"
                      : "border-neutral-800 hover:bg-neutral-900"
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className="text-sm">{r.label}</span>
                </label>
              ))}
            </fieldset>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Anything else our team should know? (optional)"
              maxLength={500}
              rows={3}
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={close}
                disabled={busy}
                className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-4 py-1.5 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!reason || busy}
                className="rounded-full bg-red-500 hover:bg-red-400 text-white text-sm font-semibold px-4 py-1.5 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
              >
                {busy ? "Sending…" : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
