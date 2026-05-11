import * as Sentry from "@sentry/nextjs";

// Thin wrapper over Sentry.captureException so route handlers and
// background jobs don't have to import the SDK directly. Pass an
// optional `context` string (e.g. `"comments POST mention notify"`)
// that becomes a Sentry tag plus a console-log prefix.
//
// We always console.error too — Netlify still captures the stdout
// log even when no Sentry DSN is configured (early days, dev).
export function reportError(error: unknown, context?: string) {
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error(error);
  }
  Sentry.captureException(error, context ? { tags: { context } } : undefined);
}
