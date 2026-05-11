// Next.js auto-loads this file on the server side. The `register`
// export runs once per cold start; `onRequestError` fires every time
// a server-rendered request throws.
//
// Why both this and Sentry? Sentry's the right long-term home, but
// requires a DSN env var that's not set yet. Until it is, we want
// SOMETHING capturing the real error.message + stack — error.tsx
// only sees the redacted "An error occurred..." string, and the
// 9-digit digest by itself tells us nothing. The console.error here
// shows up in Netlify's function logs (Site → Functions → Logs in
// the dashboard), so we can diagnose 5xx issues without any extra
// service hooked up.
//
// Once SENTRY_DSN is set, this still runs (cheap) and Sentry
// captures the error in parallel via @sentry/nextjs's own
// onRequestError instrumentation that the wrapper installs.

export async function register() {
  // Sentry's Next.js SDK uses this hook to load the right runtime
  // config (Node vs Edge). Forward to it when present so Sentry
  // initializes properly in production.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

type RequestErrorContext = {
  routerKind: "Pages Router" | "App Router";
  routePath: string;
  routeType: "render" | "route" | "action" | "middleware";
};

type RequestErrorRequest = {
  path: string;
  method: string;
  headers: { [key: string]: string };
};

export async function onRequestError(
  err: unknown,
  request: RequestErrorRequest,
  context: RequestErrorContext,
) {
  // Verbose log to Netlify function logs. The digest is what users
  // see; logging it here lets us match a screenshot to a log line.
  const digest = (err as { digest?: string })?.digest;
  const message = (err as Error)?.message ?? String(err);
  const stack = (err as Error)?.stack;
  console.error(
    "[Tuned Up SSR error]",
    JSON.stringify({
      digest,
      message,
      path: request.path,
      method: request.method,
      routeType: context.routeType,
      routePath: context.routePath,
    }),
  );
  if (stack) console.error(stack);
}
