import { currentUser } from "@clerk/nextjs/server";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { reportError } from "@/lib/report-error";

export type SyncedUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  onboardedAt: Date | null;
  timezone: string | null;
};

// Why this function tolerates DB failures
// =========================================
// `syncCurrentUser` runs in the root layout on EVERY signed-in page
// request, so any throw here brings down the whole app. We saw this
// in production when Neon's free-tier "active time" quota tripped:
// the upsert returned HTTP 402, sync-user threw, every signed-in
// page 500'd with a fresh digest, and the user just saw "Something
// broke" on /feed.
//
// Defense in depth:
//   1. The Clerk `currentUser()` call is wrapped — Clerk outages
//      shouldn't take down the app either.
//   2. The DB upsert is wrapped — if it fails we try a SELECT-only
//      fallback so the page can still render with the existing row
//      (even if it's slightly stale).
//   3. If even the SELECT fails (catastrophic DB outage), we return
//      a synthesized row built from the Clerk data we have, so
//      callers never get null mid-session.
//
// `reportError` makes sure each step still surfaces in Netlify logs
// and Sentry so we know the DB is unhealthy.

// React.cache() wrap so layout + a child page that both call this in
// the same render see one set of Clerk + DB roundtrips. Without the
// cache, /feed (which calls syncCurrentUser in both the root layout
// AND the page itself) was paying for two Clerk fetches + two
// DB upserts per render — ~150-300ms of wasted time on every signed-in
// page load.
export const syncCurrentUser = cache(_syncCurrentUser);

async function _syncCurrentUser(): Promise<SyncedUser | null> {
  let u: Awaited<ReturnType<typeof currentUser>>;
  try {
    u = await currentUser();
  } catch (e) {
    reportError(e, "sync-user Clerk currentUser");
    return null;
  }
  if (!u) return null;

  const username =
    u.username ||
    u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    `user_${u.id.slice(-6)}`;
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;

  // Only persist `imageUrl` when the user has actually uploaded a custom
  // photo. Clerk always returns a URL (a procedurally generated default
  // when there's no upload), and that default is the generic silhouette
  // we don't want to render. Storing null lets the <Avatar> component
  // fall through to its colored-initial fallback.
  const realImageUrl = u.hasImage ? (u.imageUrl ?? null) : null;

  // Step 1: try the upsert. This is the happy path 99.9% of the time.
  try {
    const [row] = await db
      .insert(users)
      .values({
        id: u.id,
        username,
        displayName,
        imageUrl: realImageUrl,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          imageUrl: realImageUrl,
        },
      })
      .returning({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        onboardedAt: users.onboardedAt,
        timezone: users.timezone,
      });
    if (row) return row;
  } catch (e) {
    // Most common reason for this branch is a Neon billing 402, but
    // ANY DB hiccup (connection timeout, schema migration in flight)
    // ends up here. Log and fall through to the read-only path.
    reportError(e, "sync-user upsert");
  }

  // Step 2: read-only fallback. If the upsert can't write, maybe the DB
  // can still read — and an existing row is good enough to render the
  // page. The avatar/name might be slightly stale until the next sync.
  try {
    const [existing] = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        onboardedAt: users.onboardedAt,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    if (existing) return existing;
  } catch (e) {
    reportError(e, "sync-user read-fallback");
  }

  // Step 3: DB is fully down. Return null. Callers treat that as
  // "no synced row available" and skip the onboarding-redirect /
  // server-side checks that depend on it. The rest of the page still
  // renders because every OTHER feed query is wrapped in safeQuery
  // and `userId` comes from Clerk (which we already have).
  return null;
}
