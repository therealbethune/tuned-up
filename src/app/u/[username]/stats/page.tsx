import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, users, follows } from "@/db";
import StatsView from "@/components/StatsView";

export const dynamic = "force-dynamic";

export default async function UserStatsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const { userId } = await auth();

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) notFound();

  // Honor private profiles for stats too.
  if (target.isPrivate && userId !== target.id) {
    if (!userId) notFound();
    const [f] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.followeeId, target.id),
          eq(follows.status, "accepted"),
        ),
      )
      .limit(1);
    if (!f) notFound();
  }

  return <StatsView target={target} isOwner={userId === target.id} />;
}
