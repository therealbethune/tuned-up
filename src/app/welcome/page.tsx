import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, ne, sql, count } from "drizzle-orm";
import { db, users, ratings, follows } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { WelcomeFlow } from "./WelcomeFlow";

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
  const [followingRows, [ratingStat], rawSuggested] = await Promise.all([
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
  ]);

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
    />
  );
}
