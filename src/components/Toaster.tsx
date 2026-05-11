"use client";
import { useEffect, useState } from "react";
import { dismiss, subscribeToasts, type Toast } from "@/lib/toast";

// Renders the active toast stack. Mounted once in the root layout.
// Stack grows downward from bottom-center on mobile, bottom-right on
// desktop. Each toast slides up + fades out on dismiss.
//
// We sit above the MobileTabBar (which is z-20) at z-30 so toasts
// remain visible if a user triggers an action while the tab bar is
// up. Position uses the safe-area inset so the toast doesn't end up
// under the iPhone home indicator.
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic
      // Pointer-events none on the container so toasts don't block
      // anything underneath; only the toast cards themselves receive
      // taps (for manual dismiss).
      className="fixed inset-x-0 z-30 pointer-events-none flex flex-col items-center sm:items-end gap-2 px-4 sm:pr-6 sm:right-0 sm:left-auto"
      style={{
        // Sit above the mobile tab bar (56px + safe-area).
        bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
      }}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-xl backdrop-blur-md max-w-sm text-left active:scale-95 transition-transform animate-[toast-in_0.18s_ease-out] ${
            t.kind === "success"
              ? "border-emerald-500/40 bg-emerald-950/85 text-emerald-100"
              : t.kind === "error"
                ? "border-red-500/40 bg-red-950/85 text-red-100"
                : "border-neutral-700 bg-neutral-900/90 text-neutral-100"
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
