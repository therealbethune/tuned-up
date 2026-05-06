import Image from "next/image";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db, follows, users } from "@/db";

export type FollowDirection = "followers" | "following";

export default async function FollowList({
  username,
  direction,
}: {
  username: string;
  direction: FollowDirection;
}) {
  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) {
    return <p className="text-neutral-400">User not found.</p>;
  }

  // followers: people who follow `target` → join on follower_id
  // following: people `target` follows → join on followee_id
  const rows =
    direction === "followers"
      ? await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            imageUrl: users.imageUrl,
            createdAt: follows.createdAt,
          })
          .from(follows)
          .innerJoin(users, eq(users.id, follows.followerId))
          .where(and(eq(follows.followeeId, target.id), eq(follows.status, "accepted")))
          .orderBy(desc(follows.createdAt))
          .limit(200)
      : await db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            imageUrl: users.imageUrl,
            createdAt: follows.createdAt,
          })
          .from(follows)
          .innerJoin(users, eq(users.id, follows.followeeId))
          .where(and(eq(follows.followerId, target.id), eq(follows.status, "accepted")))
          .orderBy(desc(follows.createdAt))
          .limit(200);

  const heading = direction === "followers" ? "Followers" : "Following";
  const empty =
    direction === "followers"
      ? "No followers yet."
      : `${target.displayName || target.username} isn't following anyone yet.`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/u/${target.username}`} className="text-sm text-neutral-400 hover:text-white">
          ← @{target.username}
        </Link>
        <h1 className="text-2xl font-bold">
          {heading}{" "}
          <span className="text-neutral-500 font-normal text-lg tabular-nums">{rows.length}</span>
        </h1>
      </div>

      {rows.length === 0 ? (
        <p className="text-neutral-500 text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((u) => (
            <li key={u.id}>
              <Link
                href={`/u/${u.username}`}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 p-3 transition-colors"
              >
                {u.imageUrl ? (
                  <Image src={u.imageUrl} alt="" width={40} height={40} className="rounded-full h-10 w-10" unoptimized />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-neutral-700" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.displayName || u.username}</div>
                  <div className="text-sm text-neutral-400 truncate">@{u.username}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
