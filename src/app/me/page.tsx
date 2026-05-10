import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { and, eq, count } from "drizzle-orm";
import { db, users, recommendations, spotifyAccounts } from "@/db";
import UserProfile from "../u/[username]/UserProfile";
import { PushBanner } from "@/components/PushBanner";
import { ConnectSpotifyBanner } from "@/components/ConnectSpotifyBanner";
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
    <div className="space-y-4">
      <PushBanner />
      <ConnectSpotifyBanner connected={spotifyConnected} />
      <div className="flex justify-end gap-4 text-sm">
        <Link
          href="/recommendations"
          className="relative text-neutral-400 hover:text-white inline-flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11l18-8-8 18-2-8-8-2z" />
          </svg>
          Recs
          {pendingRecs > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-emerald-500 text-black text-[10px] font-bold tabular-nums px-1.5 h-4 min-w-4">
              {pendingRecs > 9 ? "9+" : pendingRecs}
            </span>
          )}
        </Link>
        <Link
          href="/settings"
          className="text-neutral-400 hover:text-white inline-flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Settings
        </Link>
      </div>
      <UserProfile target={me} viewerId={userId} />
    </div>
  );
}
