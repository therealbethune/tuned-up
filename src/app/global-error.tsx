"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Last-resort error boundary. Renders when the ROOT LAYOUT itself
// throws and the regular `app/error.tsx` can't mount because the
// layout never finished. This is exactly the boundary that should
// catch any future regression like the /feed Clerk-children bug
// (where SignedOutNav inside layout.tsx threw during SSR).
//
// Must include its own <html><body> tags since the layout never
// rendered them. Must be a client component because it uses useEffect.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { digest: error.digest ?? "unknown", level: "root-layout" },
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          color: "#fafafa",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>😵</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
            Tuned Up hit the floor.
          </h1>
          <p style={{ color: "#a3a3a3", fontSize: 14, margin: "0 0 20px" }}>
            The whole app failed to render. We&apos;ve sent the error
            report — try refreshing in a moment.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                color: "#525252",
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
                marginBottom: 24,
              }}
            >
              error: {error.digest}
            </p>
          )}
          {/* Plain <a> on purpose — global-error fires when the root
              layout itself failed to render, so next/link's client
              router may not be available. We WANT a full document
              load here, not a soft navigation that might trip the
              same failure. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              borderRadius: 9999,
              background: "#ffffff",
              color: "#000000",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            Reload
          </a>
        </div>
      </body>
    </html>
  );
}
