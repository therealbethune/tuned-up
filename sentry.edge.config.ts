// Sentry initialization for the edge runtime (middleware + any
// route configured with `runtime = "edge"`). Mirror of the server
// config — separate file because edge has a different JS env and
// can't share the Node-only modules the server config might pull in.

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  sampleRate: 1.0,
  tracesSampleRate: 0,
  sendDefaultPii: false,
});
