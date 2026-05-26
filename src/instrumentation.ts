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

  // Startup environment sanity checks. Run on the Node runtime only
  // (Edge fires this hook on every cold start, which is too noisy).
  // These exist because we burned a debugging session each time one
  // of these misconfigs reached production — surfacing them once at
  // cold start in Netlify's function logs makes them obvious instead
  // of mysterious ("why is /me broken?").
  if (process.env.NEXT_RUNTIME === "nodejs") {
    runStartupChecks();
  }
}

function runStartupChecks() {
  const inProd = process.env.NODE_ENV === "production";
  const warn = (msg: string) =>
    // Use console.error so it shows up in Netlify's function-error log
    // (Site → Functions → Logs filtered to Errors), not just the
    // chatty info stream.
    console.error("⚠️  [Tuned Up startup]", msg);

  // 1) Clerk: pk_test_/sk_test_ in a production deploy means the dev
  // Clerk instance is serving auth. Dev instance Clerk user IDs do
  // NOT match the IDs already stored in the DB (those came from the
  // prod Clerk instance), so the user-row lookup on /me silently
  // fails and the page shows "Profile temporarily unavailable."
  // Caught us once — never again.
  if (inProd) {
    const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
    const sk = process.env.CLERK_SECRET_KEY ?? "";
    if (pk.startsWith("pk_test_") || sk.startsWith("sk_test_")) {
      warn(
        "Clerk is using TEST keys in a production deploy. User IDs from " +
          "the dev Clerk instance do not match the prod IDs already in the DB, " +
          "so /me will silently 'Profile temporarily unavailable' for users. " +
          "Switch NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY to " +
          "pk_live_… / sk_live_… on Netlify and redeploy.",
      );
    }
    if (!pk || !sk) {
      warn("Clerk publishable/secret key missing in production env.");
    }
  }

  // 2) Database URL — we tolerate either NETLIFY_DATABASE_URL or
  // DATABASE_URL, but if neither is set the very first DB query just
  // throws "DB connection URL missing" deep in the request path. A
  // startup-time warning makes that obvious before any user hits a
  // 500.
  const dbUrl =
    process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";
  if (inProd && !dbUrl) {
    warn(
      "No database URL configured. Set NETLIFY_DATABASE_URL or DATABASE_URL on Netlify.",
    );
  }

  // 3) VAPID keys — push notifications silently no-op when these are
  // missing. Not catastrophic, but worth knowing if you wonder why
  // a release feature shipped without pushes firing.
  if (inProd) {
    const vp = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vs = process.env.VAPID_PRIVATE_KEY;
    if (!vp || !vs) {
      warn(
        "VAPID keys missing — push notifications will silently no-op. " +
          "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable.",
      );
    }
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
  // Sentry's documented capture path for server-side throws. Carries
  // the full request context so the resulting Sentry issue includes
  // path, method, and digest as filterable tags. No-op when DSN unset.
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    /* Sentry import failed (build w/o dep) — fall through to console */
  }

  // Always also emit to Netlify function logs so we have a backup
  // signal even when Sentry isn't configured. The digest matches the
  // 9-digit code rendered in the user-facing error page, making it
  // searchable across both surfaces.
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
