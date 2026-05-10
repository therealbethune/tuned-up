import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { encodeBase64Url } from "@/lib/encoding";
import { db, activities, users, songs } from "@/db";
import { relativeTime } from "@/lib/songs";
import { FollowRequestActions } from "./FollowRequestActions";

export const dynamic = "force-dynamic";

type ActivityRow = {
  id: string;
  type: string;
  songId: string | null;
  createdAt: Date;
  readAt: Date | null;
  actorId: string;
  actorUsername: string;
  actorDisplayName: string | null;
  actorImageUrl: string | null;
  songTitle: string | null;
};

// Pick the most useful destination per activity type. Tapping the row
// jumps the user to wherever they're most likely to want to go.
function destinationFor(a: ActivityRow): string {
  switch (a.type) {
    case "recommendation":
      return "/recommendations";
    case "follow":
    case "follow_request":
      return `/u/${a.actorUsername}`;
    case "comment":
    case "like":
    case "mention":
    case "reply":
      // Tapping a like/comment/mention/reply jumps to the actor's profile —
      // typically you want to see who reacted before anything else.
      return `/u/${a.actorUsername}`;
    case "rating_match":
      return `/u/${a.actorUsername}`;
    case "rec_rated":
      // Jump to the shared rating page if we have a song.
      if (a.songId) {
        return `/r/${a.actorUsername}/${encodeBase64Url(a.songId)}`;
      }
      return `/u/${a.actorUsername}`;
    case "streak_milestone":
      return `/u/${a.actorUsername}`;
    default:
      return `/u/${a.actorUsername}`;
  }
}

export default async function ActivityPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const rows: ActivityRow[] = await db
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
            Activity shows up when someone follows you, likes or comments on your ratings,
            recommends a song to you, or rates a song you&apos;ve also rated.{" "}
            <Link href="/people" className="underline text-white">Find people</Link> to get started.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <ActivityRowItem key={a.id} a={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRowItem({ a }: { a: ActivityRow }) {
  const unread = !a.readAt;
  // follow_request rows have inline action buttons and shouldn't be tappable
  // as a whole — clicks could conflict with the Accept/Decline buttons.
  const wholeRowTappable = a.type !== "follow_request";
  const dest = destinationFor(a);

  const Inner = (
    <>
      {unread && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" aria-label="unread" />}
      {a.actorImageUrl ? (
        <Image src={a.actorImageUrl} alt="" width={40} height={40} className="rounded-full h-10 w-10 shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-neutral-700 shrink-0" />
      )}
      <div className="flex-1 min-w-0 text-sm">
        <div>
          <span className="font-medium">{a.actorDisplayName || a.actorUsername}</span>{" "}
          <span className="text-neutral-400">
            <ActivityVerb a={a} />
          </span>
        </div>
        <div className="text-xs text-neutral-500">{relativeTime(a.createdAt)}</div>
      </div>
    </>
  );

  const className = `flex items-center gap-3 rounded-lg border p-3 transition-colors ${
    unread ? "border-neutral-700 bg-neutral-900" : "border-neutral-800 bg-neutral-900/50"
  } ${wholeRowTappable ? "hover:bg-neutral-900 cursor-pointer" : ""}`;

  if (wholeRowTappable) {
    return (
      <li>
        <Link href={dest} className={className}>{Inner}</Link>
      </li>
    );
  }

  return (
    <li className={className}>
      {Inner}
      <FollowRequestActions followerUsername={a.actorUsername} />
    </li>
  );
}

function ActivityVerb({ a }: { a: ActivityRow }) {
  if (a.type === "follow") return <>started following you</>;
  if (a.type === "follow_request") return <>requested to follow you</>;
  if (a.type === "comment") {
    return (
      <>
        commented on your rating
        {a.songTitle ? (
          <>
            {" "}of <span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : null}
      </>
    );
  }
  if (a.type === "like") {
    return (
      <>
        liked your rating
        {a.songTitle ? (
          <>
            {" "}of <span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : null}
      </>
    );
  }
  if (a.type === "rating_match") {
    return (
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
    );
  }
  if (a.type === "rec_rated") {
    return (
      <>
        rated your rec
        {a.songTitle ? (
          <>
            {" "}<span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : null}
      </>
    );
  }
  if (a.type === "streak_milestone") {
    // songId is overloaded for this type: "streak:<days>:<topPct>"
    const m = (a.songId || "").match(/^streak:(\d+):(\d+)$/);
    if (m) {
      const days = m[1];
      const topPct = m[2];
      return (
        <>
          hit a <span className="text-neutral-200">{days}-day streak</span>
          <span className="text-neutral-500"> · top {topPct}%</span>
        </>
      );
    }
    return <>hit a <span className="text-neutral-200">streak milestone</span></>;
  }
  if (a.type === "recommendation") {
    return (
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
    );
  }
  if (a.type === "mention") {
    return (
      <>
        mentioned you
        {a.songTitle ? (
          <>
            {" "}on <span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : null}
      </>
    );
  }
  if (a.type === "reply") {
    return (
      <>
        replied to your comment
        {a.songTitle ? (
          <>
            {" "}on <span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : null}
      </>
    );
  }
  return <>{a.type}</>;
}
