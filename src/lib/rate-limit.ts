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
} satisfies Record<string, RateLimit>;

// Standard 429 response. The Retry-After header lets clients back off
// without retrying immediately; the JSON body gives the UI a
// machine-readable shape it can surface as a toast.
export function rateLimitedResponse(rl: RateLimit) {
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
