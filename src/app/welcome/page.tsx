import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { desc, eq, ne, sql, count } from "drizzle-orm";
import { db, users, ratings } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import { WelcomeFlow } from "./WelcomeFlow";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const me = await syncCurrentUser();
  if (!me) redirect("/");
  if (me.onboardedAt) redirect("/feed");

  // Pre-load suggested users (top raters that aren't us) + count any
  // ratings the user already has on file. The "rate at least one song"
  // counter in WelcomeFlow used to be incremented only via a window
  // `song-rated` event — which meant:
  //   - rating through /import/spotify (no event) didn't count
  //   - refreshing /welcome reset the counter to 0
  //   - already-rated users coming back to onboarding (they bounced
  //     to /welcome via redirect) saw "Rate a song to continue" even
  //     though they had ratings
  // Seeding the counter from the DB makes the gate honest.
  const [suggested, [ratingStat]] = await Promise.all([
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
      .where(ne(users.id, userId))
      .groupBy(users.id)
      .orderBy(desc(sql`count(${ratings.userId})`))
      .limit(8),
    db
      .select({ n: count() })
      .from(ratings)
      .where(eq(ratings.userId, userId)),
  ]);

  return (
    <WelcomeFlow
      suggested={suggested.filter((u) => u.ratingsCount > 0)}
      initialRatedCount={ratingStat?.n ?? 0}
    />
  );
}
