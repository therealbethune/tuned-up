import { and, eq } from "drizzle-orm";
import { db, users, follows } from "@/db";

// Privacy gate: can `viewerId` see ratings/comments/likes belonging to
// `ratingOwnerId`?
//
// Rules:
//   - You can always see your own stuff.
//   - You can always see stuff from a public account (isPrivate=false).
//   - For a private account, you can see it only if you're an *accepted*
//     follower of theirs.
//
// Returns true/false. Use this everywhere we expose data about a
// specific rating owner to a viewer who isn't them.
export async function canViewRatingsFrom(
  viewerId: string,
  ratingOwnerId: string,
): Promise<boolean> {
  if (viewerId === ratingOwnerId) return true;

  const [owner] = await db
    .select({ isPrivate: users.isPrivate })
    .from(users)
    .where(eq(users.id, ratingOwnerId))
    .limit(1);
  if (!owner) return false;
  if (!owner.isPrivate) return true;

  const [followRow] = await db
    .select({ status: follows.status })
    .from(follows)
    .where(
      and(
        eq(follows.followerId, viewerId),
        eq(follows.followeeId, ratingOwnerId),
      ),
    )
    .limit(1);
  return followRow?.status === "accepted";
}
