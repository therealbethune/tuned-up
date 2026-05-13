import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, users, blocks } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { SettingsForm } from "./SettingsForm";
import { AppleMusicAccountCard } from "@/components/AppleMusicAccountCard";
import { ProfilePictureSection } from "@/components/ProfilePictureSection";
import { BlockedUsersList } from "@/components/BlockedUsersList";
import { NotifySettings } from "@/components/NotifySettings";
import { CoverThemePicker } from "@/components/CoverThemePicker";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const [meRows, blockedRows] = await Promise.all([
    safeQuery(
      () => db.select().from(users).where(eq(users.id, userId)).limit(1),
      [] as (typeof users.$inferSelect)[],
      "settings-user-lookup",
    ),
    safeQuery(
      () =>
        db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            imageUrl: users.imageUrl,
          })
          .from(blocks)
          .innerJoin(users, eq(users.id, blocks.blockedId))
          .where(eq(blocks.blockerId, userId))
          .orderBy(desc(blocks.createdAt))
          .limit(200),
      [] as { id: string; username: string; displayName: string | null; imageUrl: string | null }[],
      "settings-blocked-list",
    ),
  ]);
  const me = meRows[0] ?? null;
  if (!me) {
    return (
      <div className="space-y-4 py-12 max-w-md mx-auto text-center">
        <div className="text-5xl">🛠️</div>
        <h1 className="text-2xl font-bold">Settings temporarily unavailable</h1>
        <p className="text-neutral-400 text-sm">
          Our database is catching its breath. Refresh in a minute.
        </p>
        {/* Use Next's <Link> not <a> so the retry doesn't do a full
            page reload — keeps Clerk state warm and avoids a flash. */}
        <Link
          href="/settings"
          className="inline-block rounded-full bg-white text-black px-5 py-2 font-medium"
        >
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">Settings</h1>
      </div>
      <ProfilePictureSection
        userId={me.id}
        initialUsername={me.username}
        initialDisplayName={me.displayName}
      />
      <SettingsForm
        username={me.username}
        displayName={me.displayName}
        isPrivate={me.isPrivate}
      />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">Connected accounts</h2>
        <AppleMusicAccountCard />
      </div>

      <CoverThemePicker initial={me.coverTheme ?? null} />

      <NotifySettings
        initial={{
          mentions: me.notifyMentions,
          comments: me.notifyComments,
          likes: me.notifyLikes,
          follows: me.notifyFollows,
          recs: me.notifyRecs,
          taste_matches: me.notifyTasteMatches,
          streak: me.notifyStreak,
        }}
      />

      <BlockedUsersList initialBlocked={blockedRows} />

      {/* Legal footer — Apple App Store Connect requires both URLs in
          the listing, and reviewers expect them to be reachable from
          inside the app too (Guideline 5.1.1, 5.1.2). Keeping them
          here puts them one tap from anywhere the user already needs
          to go (Settings is the most-visited destination from /me). */}
      <footer className="pt-6 border-t border-neutral-800 flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500">
        <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
        <Link href="/legal/terms" className="hover:text-white">Terms</Link>
        <a href="mailto:support@tuned-up.com" className="hover:text-white">support@tuned-up.com</a>
      </footer>
    </div>
  );
}
