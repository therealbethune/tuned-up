import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link
          href="/me/stats"
          className="text-sm text-neutral-400 hover:text-white inline-flex items-center gap-1"
        >
          📊 View stats →
        </Link>
      </div>
      <UserProfile target={me} viewerId={userId} />
    </div>
  );
}
