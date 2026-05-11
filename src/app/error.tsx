"use client";
import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

// Top-level error boundary. Caught by Next when any server component or
// nested route throws and isn't handled.
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
    <div className="space-y-6 py-12 max-w-md mx-auto text-center">
      <div className="text-5xl">😬</div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Something broke.</h1>
        <p className="text-neutral-400 text-sm">
          A server error occurred. It&apos;s not you — it&apos;s us. Try again, and if it
          keeps happening, let me know.
        </p>
        {error.digest && (
          <p className="text-xs text-neutral-600 font-mono">error: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-full bg-white text-black px-5 py-2 font-medium"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
