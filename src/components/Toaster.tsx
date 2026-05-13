"use client";
import { useEffect, useState } from "react";
import { dismiss, subscribeToasts, type Toast } from "@/lib/toast";

// Renders the active toast stack. Mounted once in the root layout.
// Stack grows downward from bottom-center on mobile, bottom-right on
// desktop. Each toast slides up + fades out on dismiss.
//
// Z-stack rationale: MobileTabBar is z-20, RateButton/LikersSheet
// modals are z-40, ConfirmDialog is z-50. Toasts need to sit above
// ALL of them — they're how the app reports outcomes of in-modal
// actions ("rate-limited", "Couldn't save rating"). Sitting at z-30
// (the previous value) meant any toast fired from inside a modal
// rendered hidden behind the modal backdrop. z-[60] keeps toasts
// reliably topmost. Position uses the safe-area inset so the toast
// doesn't end up under the iPhone home indicator.
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      // Pointer-events none on the container so toasts don't block
      // anything underneath; only the toast cards themselves receive
      // taps (for manual dismiss).
      className="fixed inset-x-0 z-[60] pointer-events-none flex flex-col items-center sm:items-end gap-2 px-4 sm:pr-6 sm:right-0 sm:left-auto"
      style={{
        // Sit above the mobile tab bar (56px + safe-area).
        bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
      }}
    >
      {toasts.map((t) => (
        // Each toast is its own live region. Errors use `role="alert"`
        // (assertive — announced immediately), info/success use
        // `role="status"` (polite — waits for the user to finish). A
        // separate dismiss button means tapping the toast TEXT to read
        // it doesn't accidentally clear it, which the old version did.
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          aria-live={t.kind === "error" ? "assertive" : "polite"}
          className={`pointer-events-auto rounded-xl border px-3.5 py-2.5 text-sm font-medium shadow-xl backdrop-blur-md max-w-sm flex items-start gap-2.5 toast-anim ${
            t.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/85 text-emerald-100"
              : t.kind === "error"
                ? "border-red-500/40 bg-red-950/85 text-red-100"
                : "border-neutral-700 bg-neutral-900/90 text-neutral-100"
          }`}
        >
          {/* Lead icon — visual cue for the kind so a flash-glance
              succeeds even when the user can't process the text in
              time. aria-hidden because the live-region role already
              announces the type to screen readers. */}
          <span aria-hidden className="shrink-0 mt-0.5">
            {t.kind === "success" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : t.kind === "error" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <circle cx="12" cy="16.5" r="0.5" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="11" x2="12" y2="16" />
                <circle cx="12" cy="7.5" r="0.5" fill="currentColor" />
              </svg>
            )}
          </span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 -m-1 p-1 rounded-md opacity-60 hover:opacity-100 active:scale-95 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
