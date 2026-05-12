import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import UserProfile from "./UserProfile";
import { safeQuery } from "@/lib/safe-query";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { userId } = await auth();

  // safeQuery so a DB hiccup degrades to a 404 instead of 500. The page
  // is at the public edge (anyone with a username link hits this) so
  // we'd rather show "user not found" than a crash screen.
  const rows = await safeQuery(
    () => db.select().from(users).where(eq(users.username, username)).limit(1),
    [] as (typeof users.$inferSelect)[],
    "user-page-lookup",
  );
  const target = rows[0];
  if (!target) notFound();

  return <UserProfile target={target} viewerId={userId} />;
}
