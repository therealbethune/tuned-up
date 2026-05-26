"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";

// Replacement for `window.confirm` that's actually consistent with the
// app's visual style, supports Escape-to-cancel, traps initial focus on
// the cancel button, and can render a destructive variant.
//
// Usage:
//   const [confirming, setConfirming] = useState(false);
//   ...
//   <ConfirmDialog
//     open={confirming}
//     onClose={() => setConfirming(false)}
//     onConfirm={() => { /* do thing */; setConfirming(false); }}
//     title="Delete this comment?"
//     confirmLabel="Delete"
//     destructive
//   />
//
// The component returns null when closed so it doesn't waste DOM nodes.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Remember what was focused before open so we can restore it on close —
  // same a11y pattern as LikersSheet / RateButton.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [show, setShow] = useState(false);

  useScrollLock(open);

  // Mount-then-animate + focus shuffle + Escape-to-close. The slide-up
  // matches the modal pattern the rest of the app uses (RateButton,
  // LikersSheet) so this dialog doesn't pop in stiff. The setState
  // inside the effect (setShow on next frame, setShow(false) on close)
  // is the standard pattern for driving a CSS-transition off a prop
  // boundary — lint rule misclassifies it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      const id = requestAnimationFrame(() => {
        setShow(true);
        cancelRef.current?.focus();
      });
      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape" && !busy) onClose();
      }
      document.addEventListener("keydown", onKey);
      return () => {
        cancelAnimationFrame(id);
        document.removeEventListener("keydown", onKey);
      };
    } else {
      setShow(false);
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) prev.focus();
    }
  }, [open, onClose, busy]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-opacity duration-200 ${
        show ? "bg-black/60 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={(e) => {
        // Backdrop close (only if clicked outside the inner card).
        // Guard against `busy`: tapping the backdrop while a
        // destructive action is in flight would silently dismiss the
        // dialog, leaving the user wondering whether the action ran.
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className={`relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 transform transition-transform duration-200 ease-out ${
          show ? "translate-y-0" : "translate-y-full sm:translate-y-2"
        }`}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        {/* Improvement #30: iOS-style grabber bar so the user instinct
            "swipe me down to dismiss" reads visually. Decorative only;
            backdrop tap + close button still handle the actual dismiss. */}
        <span aria-hidden className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-neutral-700 sm:hidden" />
        <div>
          <h2 id="confirm-title" className="text-base font-semibold">{title}</h2>
          {body && <p className="text-sm text-neutral-400 mt-1">{body}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-4 py-1.5 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-full text-sm font-semibold px-4 py-1.5 active:scale-95 transition-transform disabled:opacity-50 ${
              destructive
                ? "bg-red-500 hover:bg-red-400 text-white"
                : "bg-white hover:bg-neutral-200 text-black"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
