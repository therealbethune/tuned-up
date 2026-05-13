import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import StatsView from "@/components/StatsView";

export const dynamic = "force-dynamic";

export default async function MyStatsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  // The user row is the only DB read this page does directly — StatsView
  // owns the rest. Keep this trivial but typed to mirror the pattern
  // used elsewhere; no further parallel opportunity here.
  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) redirect("/");
  return <StatsView target={me} isOwner={true} />;
}
