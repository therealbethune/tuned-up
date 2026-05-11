import { currentUser } from "@clerk/nextjs/server";
import { db, users } from "@/db";

export type SyncedUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  onboardedAt: Date | null;
  timezone: string | null;
};

export async function syncCurrentUser(): Promise<SyncedUser | null> {
  const u = await currentUser();
  if (!u) return null;

  const username =
    u.username ||
    u.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    `user_${u.id.slice(-6)}`;
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;

  // Only persist `imageUrl` when the user has actually uploaded a custom
  // photo. Clerk always returns a URL (a procedurally generated default
  // when there's no upload), and that default is the generic silhouette
  // we don't want to render. Storing null lets the <Avatar> component
  // fall through to its colored-initial fallback.
  const realImageUrl = u.hasImage ? (u.imageUrl ?? null) : null;

  // Single round-trip: upsert + RETURNING the fields callers need. Insert
  // preserves onboardedAt and isPrivate; updates only touch the avatar so
  // a user-edited username/displayName from /settings isn't overwritten
  // on every page load.
  const [row] = await db
    .insert(users)
    .values({
      id: u.id,
      username,
      displayName,
      imageUrl: realImageUrl,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        imageUrl: realImageUrl,
      },
    })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      onboardedAt: users.onboardedAt,
      timezone: users.timezone,
    });

  return row ?? null;
}
