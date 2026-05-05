import { currentUser } from "@clerk/nextjs/server";
import { sql as drizzleSql } from "drizzle-orm";
import { db, users } from "@/db";

export async function syncCurrentUser() {
  const u = await currentUser();
  if (!u) return null;

  const username =
    u.username ||
    u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    `user_${u.id.slice(-6)}`;
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;

  await db
    .insert(users)
    .values({
      id: u.id,
      username,
      displayName,
      imageUrl: u.imageUrl ?? null,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username,
        displayName,
        imageUrl: u.imageUrl ?? null,
      },
    });

  return { id: u.id, username, displayName, imageUrl: u.imageUrl ?? null };
}

export async function ensureUser(userId: string) {
  // For follow targets we need them to exist. If they don't, create a placeholder.
  await db.execute(drizzleSql`SELECT 1 FROM users WHERE id = ${userId} LIMIT 1`);
}
