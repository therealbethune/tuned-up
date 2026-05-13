import { NextResponse } from "next/server";

// Rate-limit configuration for a single bucket. `max` events allowed
// per `windowSec` seconds, identified by `bucket` for human-readable
// error messages. We tag each protected endpoint with one of these
// configs and the caller-supplied count() function knows which table
// to query.
//
// Why DB-backed (vs in-memory)? Netlify Functions are stateless and
// can run on multiple instances concurrently. A per-process token
// bucket would let a single user hammer all instances simultaneously.
// Using the existing tables as the source of truth costs us one cheap
// indexed count() per write, which is fine for an app this size and
// guarantees the cap is global, not per-process.
export type RateLimit = {
  max: number;
  windowSec: number;
  bucket: string;
};

// Canned limits used by API route handlers. Tune permissively — these
// exist to stop abuse, not to throttle real users. The Spotify
// bulk-import flow can fire ~50 rating POSTs in a row when a user
// rapidly taps chips, so ratings is the most generous.
export const LIMITS = {
  COMMENTS: { max: 15, windowSec: 60, bucket: "comments" },
  LIKES: { max: 60, windowSec: 60, bucket: "likes" },
  RATINGS: { max: 120, windowSec: 60, bucket: "ratings" },
  RECOMMENDATIONS: { max: 20, windowSec: 60, bucket: "recommendations" },
  FOLLOWS: { max: 30, windowSec: 60, bucket: "follows" },
  // Reports are user-initiated abuse flags. Tight cap so a bad actor
  // can't spam staff queue; legit users rarely report > 1-2 things/day.
  REPORTS: { max: 10, windowSec: 3600, bucket: "reports" },
  // Blocks toggle on/off; a few back-and-forth taps is fine but no
  // floods. Per-hour cap is generous and keeps churn bounded.
  BLOCKS: { max: 60, windowSec: 3600, bucket: "blocks" },
  // Saves are user-driven bookmarks; tight enough to stop automated
  // hammering but never in the way for normal interactive use.
  SAVES: { max: 120, windowSec: 60, bucket: "saves" },
  // Surprise + similar suggestions hit the DB harder than most reads.
  // Cap at ~once per second per user so a stuck button can't DDoS us.
  SUGGESTIONS: { max: 60, windowSec: 60, bucket: "suggestions" },
  // Account preference patches (notify toggles, cover theme). High
  // cap because users may flip several settings in a row.
  ACCOUNT: { max: 60, windowSec: 60, bucket: "account" },
} satisfies Record<string, RateLimit>;

// Standard 429 response. The Retry-After header lets clients back off
// without retrying immediately; the JSON body gives the UI a
// machine-readable shape it can surface as a toast.
function rateLimitedResponse(rl: RateLimit) {
  return NextResponse.json(
    {
      error: `Too many ${rl.bucket} too quickly. Try again in a moment.`,
      retryAfterSec: rl.windowSec,
      bucket: rl.bucket,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(rl.windowSec),
        "Cache-Control": "no-store",
      },
    },
  );
}

// Run a count and return a 429 NextResponse if the cap is exceeded,
// else null. The caller supplies `count()` so each route can target
// the right table (comments, likes, ratings, …) using whatever
// indexed timestamp column it has.
export async function enforce(
  rl: RateLimit,
  count: () => Promise<number>,
): Promise<NextResponse | null> {
  const n = await count();
  return n >= rl.max ? rateLimitedResponse(rl) : null;
}

// Helper: window-start Date for "this many seconds ago". Inlined into
// every count() callback below but worth a one-liner.
export function windowStartDate(windowSec: number): Date {
  return new Date(Date.now() - windowSec * 1000);
}

// In-memory token bucket for endpoints whose abuse vector doesn't fit
// the DB-count pattern (suggestions GETs, settings patches, anything
// without a natural per-user timestamp). Process-local, so across
// multiple Netlify instances a determined attacker can multiply the
// cap by the instance count — that's fine for these endpoints since
// abuse is more "stuck client retrying" than "coordinated DDoS".
const buckets = new Map<string, number[]>();
export function memoryRateLimited(rl: RateLimit, key: string): NextResponse | null {
  const now = Date.now();
  const cutoff = now - rl.windowSec * 1000;
  const arr = (buckets.get(key) ?? []).filter((t) => t >= cutoff);
  if (arr.length >= rl.max) {
    return NextResponse.json(
      {
        error: `Too many ${rl.bucket} too quickly. Try again in a moment.`,
        retryAfterSec: rl.windowSec,
        bucket: rl.bucket,
      },
      {
        status: 429,
        headers: { "Retry-After": String(rl.windowSec), "Cache-Control": "no-store" },
      },
    );
  }
  arr.push(now);
  buckets.set(key, arr);
  // Best-effort eviction: bounded growth across many users isn't
  // realistic in practice but keep the map from leaking forever.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v[v.length - 1] < cutoff) buckets.delete(k);
    }
  }
  return null;
}
