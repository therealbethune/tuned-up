import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const [me] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!me) redirect("/");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">Settings</h1>
      </div>
      <SettingsForm
        username={me.username}
        displayName={me.displayName}
        isPrivate={me.isPrivate}
      />
    </div>
  );
}
