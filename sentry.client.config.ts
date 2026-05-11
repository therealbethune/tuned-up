// Sentry initialization for the browser bundle. Loaded on every
// client-rendered page via Next.js's built-in convention.
//
// Why we need it: client-side throws (a 429 we mishandle, a React
// hydration error, an MusicKit JS edge case) were going to the
// browser console and dying there. Now they fan out to Sentry where
// we can actually see stack traces + breadcrumbs.
//
// DSN comes from the public env var so it ships in the bundle.
// Production-only — local `next dev` runs without a DSN and the SDK
// turns into a no-op.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Only enable when a DSN is configured. Lets developers run the
  // project locally without spamming a production project, and keeps
  // the smoke test / preview deploys quiet by default.
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  // Sample 100% of errors. We're small — every error matters and the
  // free-tier quota is plenty.
  sampleRate: 1.0,
  // Skip perf tracing for now; just want error capture.
  tracesSampleRate: 0,
  // Don't send PII. Clerk user-ids end up in some breadcrumbs anyway
  // (set explicitly via Sentry.setUser when we want them), so opt out
  // of automatic email/IP collection.
  sendDefaultPii: false,
});
