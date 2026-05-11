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

export const dynamic = "force-dynamic";

export default async function MePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) redirect("/");

  // Pending recommendations count → drives the badge on the Recs link.
  const [recStat] = await db
    .select({ n: count() })
    .from(recommendations)
    .where(
      and(eq(recommendations.toUserId, userId), eq(recommendations.status, "pending")),
    );
  const pendingRecs = Number(recStat?.n ?? 0);

  const spotifyConnected = (await safeQuery(
    () =>
      db
        .select({ id: spotifyAccounts.userId })
        .from(spotifyAccounts)
        .where(eq(spotifyAccounts.userId, userId)),
    [] as { id: string }[],
    "me-spotify-link",
  )).length > 0;

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
