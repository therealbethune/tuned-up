import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, count } from "drizzle-orm";
import { db, users, recommendations, savedSongs } from "@/db";
import UserProfile from "../u/[username]/UserProfile";
import { PushBanner } from "@/components/PushBanner";
import { ConnectMusicBanner } from "@/components/ConnectMusicBanner";
import { ProfileAppleMusicPanel } from "@/components/ProfileAppleMusicPanel";
import { SettingsIcon, PaperPlaneIcon } from "@/components/icons";
import { safeQuery } from "@/lib/safe-query";
import { TasteTwinsPanel } from "@/components/TasteTwinsPanel";
import { findTasteTwins } from "@/lib/taste";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Wrap the user-row SELECT so a transient DB outage (Neon 402, etc.)
  // doesn't 500 the whole /me page. If the lookup fails or finds
  // nothing, render the outage state below rather than redirecting —
  // the user wanted /me, sending them to / is just hiding the problem.
  const meRows = await safeQuery(
    () => db.select().from(users).where(eq(users.id, userId)).limit(1),
    [] as (typeof users.$inferSelect)[],
    "me-user-lookup",
  );
  const me = meRows[0] ?? null;
  if (!me) {
    return (
      <div className="space-y-4 py-12 max-w-md mx-auto text-center">
        <div className="text-5xl">🛠️</div>
        <h1 className="text-2xl font-bold">Profile temporarily unavailable</h1>
        <p className="text-neutral-400 text-sm">
          Our database is catching its breath. Refresh in a minute. The
          rest of the app (feed, discover) may still work.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {/* Use <Link> so the retry doesn't burn a full page reload
              + Clerk-state rehydrate cycle when the DB is just slow. */}
          <Link
            href="/feed"
            className="rounded-full bg-white text-black px-5 py-2 font-medium"
          >
            Open feed
          </Link>
          <Link
            href="/me"
            className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  // Toolbar badges — pending-rec count + saved-songs count. Fan out
  // in parallel since they're both small + independent.
  const [recStatRows, savedStatRows, tasteTwins] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({ n: count() })
          .from(recommendations)
          .where(
            and(
              eq(recommendations.toUserId, userId),
              eq(recommendations.status, "pending"),
            ),
          ),
      [] as { n: number }[],
      "me-pending-recs",
    ),
    safeQuery(
      () =>
        db
          .select({ n: count() })
          .from(savedSongs)
          .where(eq(savedSongs.userId, userId)),
      [] as { n: number }[],
      "me-saved-count",
    ),
    safeQuery(() => findTasteTwins(userId), [], "me-taste-twins"),
  ]);
  const pendingRecs = Number(recStatRows[0]?.n ?? 0);
  const savedCount = Number(savedStatRows[0]?.n ?? 0);

  return (
    <div className="space-y-6">
      {/* Toolbar lives at the very top — small, icon-led links to
          /recommendations and /settings. The pending-recs badge sits
          on the Recs link. Keep the link weights low so they don't
          compete with the profile header below. */}
      <div className="flex justify-end gap-2 text-sm">
        <Link
          href="/me/recap"
          aria-label="Your week in music"
          className="text-neutral-400 hover:text-white inline-flex items-center gap-1.5 rounded-full hover:bg-neutral-900 px-3 py-1.5 active:scale-95 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="17" rx="2" />
            <path d="M3 10h18M8 2v4M16 2v4" />
          </svg>
          Recap
        </Link>
        <Link
          href="/me/saved"
          aria-label="Saved for later"
          className="relative text-neutral-400 hover:text-white inline-flex items-center gap-1.5 rounded-full hover:bg-neutral-900 px-3 py-1.5 active:scale-95 transition-all"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M6 4h12v17l-6-4-6 4z" />
          </svg>
          Saved
          {savedCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500/20 text-amber-200 text-[10px] font-bold tabular-nums px-1.5 h-4 min-w-4">
              {savedCount > 99 ? "99+" : savedCount}
            </span>
          )}
        </Link>
        <Link
          href="/recommendations"
          aria-label="Recommendations"
          className="relative text-neutral-400 hover:text-white inline-flex items-center gap-1.5 rounded-full hover:bg-neutral-900 px-3 py-1.5 active:scale-95 transition-all"
        >
          <PaperPlaneIcon size={14} />
          Recs
          {pendingRecs > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-500 text-black text-[10px] font-bold tabular-nums px-1.5 h-4 min-w-4">
              {pendingRecs > 9 ? "9+" : pendingRecs}
            </span>
          )}
        </Link>
        <Link
          href="/settings"
          aria-label="Settings"
          className="text-neutral-400 hover:text-white inline-flex items-center gap-1.5 rounded-full hover:bg-neutral-900 px-3 py-1.5 active:scale-95 transition-all"
        >
          <SettingsIcon size={14} />
          Settings
        </Link>
      </div>

      {/* Profile is the actual content. Render before any banners so
          users see THEIR face before any interruption nag-cards. */}
      <UserProfile target={me} viewerId={userId} />

      <TasteTwinsPanel twins={tasteTwins} />

      {/* Banners + integration panels live below — they're contextual
          additions, not the page's primary purpose. */}
      <PushBanner />
      <ConnectMusicBanner />
      <ProfileAppleMusicPanel />
    </div>
  );
}
