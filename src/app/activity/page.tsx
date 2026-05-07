import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, activities, users, songs } from "@/db";
import { relativeTime } from "@/lib/songs";
import { FollowRequestActions } from "./FollowRequestActions";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows = await db
    .select({
      id: activities.id,
      type: activities.type,
      songId: activities.songId,
      createdAt: activities.createdAt,
      readAt: activities.readAt,
      actorId: users.id,
      actorUsername: users.username,
      actorDisplayName: users.displayName,
      actorImageUrl: users.imageUrl,
      songTitle: songs.title,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.actorId))
    .leftJoin(songs, eq(songs.id, activities.songId))
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.createdAt))
    .limit(50);

  // Mark unread as read so the badge clears for the next page nav.
  await db
    .update(activities)
    .set({ readAt: new Date() })
    .where(and(eq(activities.userId, userId), isNull(activities.readAt)));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-neutral-400 text-sm">Who&apos;s been interacting with you.</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          <p>Nothing here yet.</p>
          <p className="text-sm mt-2">
            <Link href="/people" className="underline text-white">Find people</Link> to follow — when they follow you back or comment on your ratings, it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => {
            const unread = !a.readAt;
            return (
              <li
                key={a.id}
                className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                  unread
                    ? "border-neutral-700 bg-neutral-900"
                    : "border-neutral-800 bg-neutral-900/50"
                }`}
              >
                {unread && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" aria-label="unread" />}
                <Link href={`/u/${a.actorUsername}`} className="shrink-0">
                  {a.actorImageUrl ? (
                    <Image src={a.actorImageUrl} alt="" width={40} height={40} className="rounded-full h-10 w-10" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-neutral-700" />
                  )}
                </Link>
                <div className="flex-1 min-w-0 text-sm">
                  <div>
                    <Link href={`/u/${a.actorUsername}`} className="font-medium hover:underline">
                      {a.actorDisplayName || a.actorUsername}
                    </Link>{" "}
                    <span className="text-neutral-400">
                      {a.type === "follow" && "started following you"}
                      {a.type === "follow_request" && "requested to follow you"}
                      {a.type === "comment" && (
                        <>
                          commented on your rating
                          {a.songTitle ? (
                            <>
                              {" "}of <span className="text-neutral-200">{a.songTitle}</span>
                            </>
                          ) : null}
                        </>
                      )}
                      {a.type === "like" && (
                        <>
                          liked your rating
                          {a.songTitle ? (
                            <>
                              {" "}of <span className="text-neutral-200">{a.songTitle}</span>
                            </>
                          ) : null}
                        </>
                      )}
                      {a.type === "rating_match" && (
                        <>
                          also rated
                          {a.songTitle ? (
                            <>
                              {" "}<span className="text-neutral-200">{a.songTitle}</span>
                            </>
                          ) : (
                            " a song you rated"
                          )}
                        </>
                      )}
                      {a.type === "recommendation" && (
                        <>
                          recommended
                          {a.songTitle ? (
                            <>
                              {" "}<span className="text-neutral-200">{a.songTitle}</span>
                            </>
                          ) : (
                            " a song"
                          )}{" "}
                          to you
                        </>
                      )}
                      {!["follow", "follow_request", "comment", "like", "rating_match", "recommendation"].includes(a.type) && a.type}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    {relativeTime(a.createdAt)}
                  </div>
                </div>
                {a.type === "follow_request" && (
                  <FollowRequestActions followerUsername={a.actorUsername} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
