import { currentUser } from "@clerk/nextjs/server";
import { sql as drizzleSql, eq } from "drizzle-orm";
import { db, users } from "@/db";

export type SyncedUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  onboardedAt: Date | null;
};

export async function syncCurrentUser(): Promise<SyncedUser | null> {
  const u = await currentUser();
  if (!u) return null;

  const username =
    u.username ||
    u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    `user_${u.id.slice(-6)}`;
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;

  // Insert sets onboardedAt to null implicitly; update preserves it (we don't
  // touch it here so onboarding completion isn't overwritten).
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

  const [row] = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      onboardedAt: users.onboardedAt,
    })
    .from(users)
    .where(eq(users.id, u.id))
    .limit(1);

  return row ?? null;
}

export async function ensureUser(userId: string) {
  await db.execute(drizzleSql`SELECT 1 FROM users WHERE id = ${userId} LIMIT 1`);
}
