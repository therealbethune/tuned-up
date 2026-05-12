import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { db, follows, users } from "@/db";
import { Avatar } from "@/components/Avatar";

export type FollowDirection = "followers" | "following";

const LIST_LIMIT = 200;

export default async function FollowList({
  username,
  direction,
}: {
  username: string;
  direction: FollowDirection;
}) {
  const { userId: viewerId } = await auth();
  const [target] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!target) {
    return <p className="text-neutral-400">User not found.</p>;
  }

  // Privacy gate. The profile page itself gates ratings behind a follow
  // check for private users, but the /followers and /following sub-pages
  // were previously open to anyone — making the social graph of every
  // private account fully discoverable by URL. Match the same rule used
  // in /u/[username]/stats: owner sees their own, accepted followers see
  // theirs, everyone else gets a 404.
  if (target.isPrivate && viewerId !== target.id) {
    if (!viewerId) notFound();
    const [f] = await db
      .select({ status: follows.status })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, viewerId),
          eq(follows.followeeId, target.id),
          eq(follows.status, "accepted"),
        ),
      )
      .limit(1);
    if (!f) notFound();
  }

  // followers: people who follow `target` → join on follower_id
  // following: people `target` follows → join on followee_id
  // Fan out the list + the total count so the header shows the real
  // number rather than `rows.length` (which would cap at LIST_LIMIT).
  const whereCondition =
    direction === "followers"
      ? and(eq(follows.followeeId, target.id), eq(follows.status, "accepted"))
      : and(eq(follows.followerId, target.id), eq(follows.status, "accepted"));
  const joinUserId =
    direction === "followers" ? follows.followerId : follows.followeeId;

  const [rows, [totalStat]] = await Promise.all([
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        imageUrl: users.imageUrl,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .innerJoin(users, eq(users.id, joinUserId))
      .where(whereCondition)
      .orderBy(desc(follows.createdAt))
      .limit(LIST_LIMIT),
    db.select({ n: count() }).from(follows).where(whereCondition),
  ]);
  const total = totalStat?.n ?? rows.length;

  const heading = direction === "followers" ? "Followers" : "Following";
  const empty =
    direction === "followers"
      ? `Nobody's following ${target.displayName || target.username} yet — be the first.`
      : `${target.displayName || target.username} hasn't followed anyone yet. Their feed must be lonely.`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link href={`/u/${target.username}`} className="text-sm text-neutral-400 hover:text-white">
          ← @{target.username}
        </Link>
        <h1 className="text-2xl font-bold">
          {heading}{" "}
          <span className="text-neutral-500 font-normal text-lg tabular-nums">{total}</span>
        </h1>
        {total > rows.length && (
          <p className="text-xs text-neutral-500">
            Showing the most recent {rows.length} — the full list isn&apos;t paginated yet.
          </p>
        )}
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
                <Avatar
                  imageUrl={u.imageUrl}
                  name={u.displayName || u.username}
                  seed={u.id}
                  size={40}
                  ring={false}
                />
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
