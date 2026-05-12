"use client";
import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { TunedUpMark } from "@/components/icons";

// Top-level error boundary. Caught by Next when any server component or
// nested route throws and isn't handled. Branded to match /not-found so
// "something broke" doesn't feel like a different application than the
// rest of the surface.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to Sentry with the Next.js digest as a tag so the error
    // shown to the user (the 6-digit code on the error page) is the
    // same value searchable in the Sentry dashboard. No-op when the
    // DSN is unset (local dev / first deploy before secrets land).
    Sentry.captureException(error, {
      tags: { digest: error.digest ?? "unknown" },
    });
    if (typeof console !== "undefined") {
      console.error("[Tuned Up] uncaught:", error);
    }
  }, [error]);

  return (
    <div className="tu-emerald-glow space-y-6 py-16 max-w-md mx-auto text-center">
      <div className="inline-flex h-14 w-14 rounded-2xl bg-emerald-500 text-black items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto">
        <TunedUpMark size={28} />
      </div>
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/80 font-semibold">
          Server error
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Out of tune</h1>
        <p className="text-neutral-400 text-sm">
          Something broke on our end. Try again — if it keeps happening,
          let me know.
        </p>
        {error.digest && (
          <p className="text-xs text-neutral-600 font-mono pt-1">
            error: {error.digest}
          </p>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <button
          onClick={() => reset()}
          className="rounded-full bg-white text-black px-5 py-2 font-medium active:scale-95 transition-transform"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900 active:scale-95 transition-transform"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
