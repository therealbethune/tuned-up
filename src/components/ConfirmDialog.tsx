"use client";
import { useEffect, useRef } from "react";
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

  useScrollLock(open);

  // Escape key + initial focus.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => cancelRef.current?.focus());
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        // Backdrop close (only if clicked outside the inner card).
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-sm rounded-t-2xl sm:rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
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
