import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, count } from "drizzle-orm";
import { db, users, recommendations, spotifyAccounts } from "@/db";
import UserProfile from "../u/[username]/UserProfile";
import { PushBanner } from "@/components/PushBanner";
import { ConnectMusicBanner } from "@/components/ConnectMusicBanner";
import { ProfileSpotifyPanel } from "@/components/ProfileSpotifyPanel";
import { ProfileAppleMusicPanel } from "@/components/ProfileAppleMusicPanel";
import { SettingsIcon, PaperPlaneIcon } from "@/components/icons";
import { safeQuery } from "@/lib/safe-query";
import { isSpotifyConnected } from "@/lib/cached-queries";

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
          <a
            href="/feed"
            className="rounded-full bg-white text-black px-5 py-2 font-medium"
          >
            Open feed
          </a>
          <a
            href="/me"
            className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Pending-recs count + Spotify-link status fan out — both gate UI on
  // the same page header and neither depends on the other. Same idea as
  // /feed and the profile page: serial awaits here add up to a visible
  // hold on every /me visit.
  const [recStatRows, spotifyConnected] = await Promise.all([
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
    isSpotifyConnected(userId),
  ]);
  const pendingRecs = Number(recStatRows[0]?.n ?? 0);

  return (
    <div className="space-y-6">
      {/* Toolbar lives at the very top — small, icon-led links to
          /recommendations and /settings. The pending-recs badge sits
          on the Recs link. Keep the link weights low so they don't
          compete with the profile header below. */}
      <div className="flex justify-end gap-2 text-sm">
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

      {/* Banners + integration panels live below — they're contextual
          additions, not the page's primary purpose. */}
      <PushBanner />
      <ConnectMusicBanner spotifyConnected={spotifyConnected} />
      <ProfileSpotifyPanel connected={spotifyConnected} />
      <ProfileAppleMusicPanel />
    </div>
  );
}
