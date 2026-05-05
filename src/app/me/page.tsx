import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { syncCurrentUser } from "@/lib/sync-user";
import UserProfile from "../u/[username]/UserProfile";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const synced = await syncCurrentUser();
  const username = synced?.username;
  if (!username) redirect("/");

  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) redirect("/");

  return <UserProfile target={me} viewerId={userId} />;
}
