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

  // Pre-load suggested users (top raters that aren't us).
  const suggested = await db
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
    .limit(8);

  return <WelcomeFlow suggested={suggested.filter((u) => u.ratingsCount > 0)} />;
}
