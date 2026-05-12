import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, users, spotifyAccounts } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { SettingsForm } from "./SettingsForm";
import { SpotifyAccountCard } from "@/components/SpotifyAccountCard";
import { AppleMusicAccountCard } from "@/components/AppleMusicAccountCard";
import { ProfilePictureSection } from "@/components/ProfilePictureSection";
import { SPOTIFY_LINK_SCOPES } from "@/lib/spotify-server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string; reason?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  // Fan out user + spotify-account lookups in parallel — they're
  // independent and were previously two sequential round-trips. The
  // user row is required (outage state below); the spotify row is
  // optional, so we fall through to "not linked" if missing.
  // safeQuery wrappers keep a transient DB outage from 500-ing the
  // whole page.
  const [meRows, linkRows] = await Promise.all([
    safeQuery(
      () => db.select().from(users).where(eq(users.id, userId)).limit(1),
      [] as (typeof users.$inferSelect)[],
      "settings-user-lookup",
    ),
    safeQuery(
      () =>
        db
          .select({
            spotifyUserId: spotifyAccounts.spotifyUserId,
            scope: spotifyAccounts.scope,
          })
          .from(spotifyAccounts)
          .where(eq(spotifyAccounts.userId, userId)),
      [] as { spotifyUserId: string; scope: string }[],
      "settings-spotify-link",
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

  const link = linkRows[0];

  // Check whether the user's stored scopes cover every scope we currently
  // request. If they connected before we added a new scope (now-playing,
  // for instance), this is false and we surface a "Refresh permissions"
  // affordance on the Spotify card.
  const requiredScopes = SPOTIFY_LINK_SCOPES.split(" ");
  const missingScopes = link
    ? requiredScopes.filter((s) => !link.scope.split(" ").includes(s))
    : [];

  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">Settings</h1>
      </div>
      {sp.spotify === "connected" && (
        <p className="rounded-md border border-emerald-700/40 bg-emerald-700/10 text-emerald-300 text-sm px-3 py-2">
          Spotify connected ✓
        </p>
      )}
      {sp.spotify === "error" && (
        <p className="rounded-md border border-red-700/40 bg-red-700/10 text-red-300 text-sm px-3 py-2">
          Spotify connection failed{sp.reason ? ` (${sp.reason})` : ""}.
        </p>
      )}
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
        <SpotifyAccountCard
          connected={Boolean(link)}
          spotifyUserId={link?.spotifyUserId ?? null}
          missingScopes={missingScopes}
        />
        <AppleMusicAccountCard />
      </div>
    </div>
  );
}
