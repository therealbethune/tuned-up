import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db, pushSubscriptions, users } from "@/db";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@tuned-up.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  configured = true;
  return true;
}

// Notification categories — each maps to a column on `users` so the
// recipient can opt out per category without losing the subscription.
// Push tag prefixes are matched here so callers pass a meaningful
// category string instead of relying on string-matching the tag.
export type PushCategory =
  | "mention"
  | "comment"
  | "like"
  | "follow"
  | "rec"
  | "taste_match"
  | "streak";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  /** Category for opt-out checks. Optional so existing callers keep
   *  working; absent = treat as always-on (cron pings, system msgs). */
  category?: PushCategory;
};

// Send a notification to every device a user has registered. Removes any
// subscription that the push service rejects with 404 / 410. If the
// recipient has opted out of `payload.category` in their preferences,
// the call is a silent no-op.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  if (payload.category) {
    const [prefs] = await db
      .select({
        m: users.notifyMentions,
        c: users.notifyComments,
        l: users.notifyLikes,
        f: users.notifyFollows,
        r: users.notifyRecs,
        t: users.notifyTasteMatches,
        s: users.notifyStreak,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (prefs) {
      const allowed: Record<PushCategory, boolean> = {
        mention: prefs.m ?? true,
        comment: prefs.c ?? true,
        like: prefs.l ?? true,
        follow: prefs.f ?? true,
        rec: prefs.r ?? true,
        taste_match: prefs.t ?? true,
        streak: prefs.s ?? true,
      };
      if (!allowed[payload.category]) return;
    }
  }

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const stale: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        );
      } catch (e) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404 || err.statusCode === 410) {
          stale.push(s.endpoint);
        }
        // Other errors are transient — we'll try again on the next event.
      }
    }),
  );

  if (stale.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, stale));
  }
}
