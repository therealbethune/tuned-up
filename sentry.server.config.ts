// Sentry initialization for server-rendered code. Loaded by Next.js
// on cold start of every server-side runtime (the Netlify Functions
// each route compiles into).
//
// This is the half that would have caught the /feed Clerk-children
// regression — the throw was during SSR and never reached the browser.
// With this wired, a future server-side throw becomes a Sentry issue
// with file, line, and request context attached.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  sampleRate: 1.0,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
