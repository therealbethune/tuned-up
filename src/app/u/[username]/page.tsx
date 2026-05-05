import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import UserProfile from "./UserProfile";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const { userId } = await auth();

  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) notFound();

  return <UserProfile target={target} viewerId={userId} />;
}
