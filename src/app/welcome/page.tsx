import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, sql, count, notInArray } from "drizzle-orm";
import { db, users, ratings, follows, songs } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { WelcomeFlow } from "./WelcomeFlow";
import { safeQuery } from "@/lib/safe-query";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const me = await syncCurrentUser();
  if (!me) redirect("/");
  if (me.onboardedAt) redirect("/feed");

  // Pre-load the page in three parallel queries:
  //
  //   - ratingsCount: seeds the "rate at least one song" gate so
  //     rating via /import/spotify or coming back to /welcome with
  //     existing ratings doesn't reset the counter to 0.
  //   - existingFollows: lets us filter suggested users to people the
  //     viewer doesn't already follow. Before this, a user who'd
  //     followed Alice yesterday would still see Alice in step 2's
  //     suggested list with a "Follow" button — tapping it would
  //     no-op server-side (onConflictDoNothing) but the UI lied
  //     about state.
  //   - suggested: top raters excluding self.
  //
  // existingFollows must come back before we can filter the suggested
  // list, so we do that filter in JS after both resolve.
  const [followingRows, [ratingStat], rawSuggested, myRatedRows] = await Promise.all([
    db
      .select({ id: follows.followeeId })
      .from(follows)
      .where(eq(follows.followerId, userId)),
    db
      .select({ n: count() })
      .from(ratings)
      .where(eq(ratings.userId, userId)),
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        ratingsCount: count(ratings.userId),
      })
      .from(users)
      .leftJoin(ratings, eq(ratings.userId, users.id))
      .where(and(ne(users.id, userId), eq(users.isPrivate, false)))
      .groupBy(users.id)
      .orderBy(desc(sql`count(${ratings.userId})`))
      .limit(16),
    // Songs the viewer has already rated — used to filter the
    // "popular ideas" rail so we don't show them a song they've
    // already scored.
    db
      .select({ songId: ratings.songId })
      .from(ratings)
      .where(eq(ratings.userId, userId)),
  ]);

  // Six most-rated songs (any kind) that the viewer hasn't rated yet.
  // Surfaced as a tap-to-rate rail in WelcomeFlow step 1 so new users
  // who don't know what to search for can get to a first rating in two
  // taps instead of hunting through search.
  const ratedSongIds = myRatedRows.map((r) => r.songId);
  const popularSongs = await safeQuery(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          thumbnail: songs.thumbnail,
          durationSeconds: songs.durationSeconds,
          kind: songs.kind,
          n: sql<number>`count(${ratings.songId})::int`,
        })
        .from(ratings)
        .innerJoin(songs, eq(songs.id, ratings.songId))
        .where(ratedSongIds.length ? notInArray(songs.id, ratedSongIds) : undefined)
        .groupBy(songs.id)
        .having(sql`count(${ratings.songId}) >= 2`)
        .orderBy(desc(sql`count(${ratings.songId})`))
        .limit(6),
    [] as Array<{
      songId: string;
      title: string;
      artist: string;
      thumbnail: string | null;
      durationSeconds: number | null;
      kind: string;
      n: number;
    }>,
    "welcome-popular",
  );

  // We over-fetched to 16 above so we still have 8 to show even when
  // some of the top raters are already followed and get filtered out.
  const alreadyFollowing = new Set(followingRows.map((r) => r.id));
  const suggested = rawSuggested
    .filter((u) => u.ratingsCount > 0 && !alreadyFollowing.has(u.id))
    .slice(0, 8);

  return (
    <WelcomeFlow
      suggested={suggested}
      initialRatedCount={ratingStat?.n ?? 0}
      popularSongs={popularSongs.map((p) => ({
        id: p.songId,
        title: p.title,
        artist: p.artist,
        thumbnail: p.thumbnail,
        durationSeconds: p.durationSeconds,
        kind: (p.kind === "album" ? "album" : "song") as "song" | "album",
      }))}
    />
  );
}
