import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { encodeBase64Url } from "@/lib/encoding";
import { db, activities, users, songs } from "@/db";
import { getBlockEdges } from "@/lib/block-edges";
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
  // Username of the user who owns the rating this activity points to.
  // Set on comment/like/mention/reply/rating_match/rec_rated rows; null
  // for follow/recommendation/streak_milestone or pre-migration rows.
  ratingOwnerUsername: string | null;
  // userId of the rating owner — used to build the `/feed?focus=<userId>:<songId>`
  // anchor URL.
  ratingOwnerId: string | null;
};

// Every actionable activity type routes to the FEED with a focus-anchor
// so the user lands on the rating's card with all the normal context
// (comments expanded, likes tap-to-see, save buttons, etc).
//
// /feed?focus=<ratingUserId>:<songId>#rating-<ratingUserId>-<encodedSongId>
//
// The `focus` query param forces the feed page to include the specific
// rating even if the viewer doesn't follow the rating owner — so this
// works for mention/reply/rec_rated/rating_match where the rating is
// on someone else's profile, not necessarily anyone the viewer follows.
//
// The trailing hash drives the browser scroll + CSS :target glow.
function destinationFor(
  a: ActivityRow,
  viewerId: string,
): string {
  function feedFocus(ratingUserId: string, songId: string): string {
    const enc = encodeBase64Url(songId);
    return `/feed?focus=${ratingUserId}:${encodeURIComponent(songId)}#rating-${ratingUserId}-${enc}`;
  }

  // For comment/like/mention/reply: the rating belongs to ratingOwnerId
  // (joined in via activities.ratingUserId). Falls back gracefully if
  // ratingOwnerId is null (pre-migration rows).
  const ratingOwnerId = a.ratingOwnerId;

  switch (a.type) {
    case "recommendation":
      return "/recommendations";
    case "follow":
    case "follow_request":
      return `/u/${a.actorUsername}`;
    case "comment":
    case "like":
      // Recipient = rating owner = viewer. The rating is on their feed.
      if (a.songId) return feedFocus(viewerId, a.songId);
      return `/u/${a.actorUsername}`;
    case "mention":
    case "reply":
      // Recipient is NOT the rating owner. ratingOwnerId tells us whose
      // rating it actually is so we can focus the feed there.
      if (a.songId && ratingOwnerId) return feedFocus(ratingOwnerId, a.songId);
      return `/u/${a.actorUsername}`;
    case "rating_match":
    case "taste_match":
    case "rec_rated":
      // Actor's rating is the target. Use ratingOwnerId (which is the
      // actorId for these types).
      if (a.songId && ratingOwnerId) return feedFocus(ratingOwnerId, a.songId);
      if (a.songId) return feedFocus(a.actorId, a.songId);
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

  // Second alias on users for the rating-owner LEFT JOIN (so we can
  // build /r/<owner>/<songId> URLs without a per-row lookup).
  const ratingOwner = alias(users, "rating_owner");

  // SELECT-then-UPDATE on purpose. These were previously parallelized,
  // but that races the "mark everything read" UPDATE against the SELECT
  // that drives render — if the UPDATE wins, the SELECT returns rows
  // with readAt already populated and every activity renders without
  // the "unread" highlight, even on the first time the user sees them.
  // Sequential costs one extra DB roundtrip but preserves the visual
  // "new since last visit" cue on the row's first paint.
  // Block-aware: any activity row whose actor is on either side of a
  // block edge with the viewer is hidden. Without this, a blocked user
  // can still notify you (e.g. by liking your rating) — defeats the
  // point of blocking per App Store Guideline 1.2.
  const { hiddenIds } = await getBlockEdges(userId);

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
      ratingOwnerUsername: ratingOwner.username,
      ratingOwnerId: activities.ratingUserId,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.actorId))
    .leftJoin(songs, eq(songs.id, activities.songId))
    .leftJoin(ratingOwner, eq(ratingOwner.id, activities.ratingUserId))
    .where(
      hiddenIds.length
        ? and(eq(activities.userId, userId), notInArray(activities.actorId, hiddenIds))
        : eq(activities.userId, userId),
    )
    .orderBy(desc(activities.createdAt))
    .limit(50);

  // Fire-and-forget mark-as-read. We don't await because the user's
  // already looking at the rendered list; whether the write lands
  // before or after navigation away doesn't matter for THIS page render.
  // The next /activity visit will see the updated readAt values.
  db.update(activities)
    .set({ readAt: new Date() })
    .where(and(eq(activities.userId, userId), isNull(activities.readAt)))
    .catch(() => {
      /* non-critical — the unread badge will just persist one more visit */
    });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-neutral-400 text-sm">Who&apos;s been interacting with you.</p>
      </div>

      {rows.length === 0 ? (
        <div className="relative rounded-2xl border border-emerald-500/30 bg-[radial-gradient(circle_at_top,theme(colors.emerald.500/0.18),theme(colors.neutral.950)_70%)] p-8 sm:p-10 text-center space-y-4 overflow-hidden">
          <div className="text-5xl">🔔</div>
          <h2 className="text-2xl font-bold tracking-tight">Quiet for now.</h2>
          <p className="text-sm text-neutral-300 max-w-sm mx-auto">
            Activity shows up when someone follows you, likes or comments on your ratings, recommends a song, or rates one of your songs.
          </p>
          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
            <Link
              href="/people"
              className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold px-5 py-2 active:scale-95 transition-transform shadow-lg shadow-emerald-500/20"
            >
              Find people to follow
            </Link>
            <Link
              href="/search"
              className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-5 py-2 active:scale-95 transition-transform"
            >
              Rate a song
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((a) => (
            <ActivityRowItem key={a.id} a={a} viewerId={userId} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Small type-tinted dot rendered over the avatar so scanning the
// activity feed pre-attentively distinguishes a like from a comment
// from a follow without having to read every line.
function ActivityTypeBadge({ type }: { type: string }) {
  const { icon, ring } = activityBadge(type);
  return (
    <span
      aria-hidden
      className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full inline-flex items-center justify-center ${ring}`}
    >
      {icon}
    </span>
  );
}

function activityBadge(type: string): { icon: React.ReactNode; ring: string } {
  if (type === "like") {
    return {
      ring: "bg-rose-500 text-white ring-2 ring-neutral-900",
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
    };
  }
  if (type === "comment" || type === "reply") {
    return {
      ring: "bg-sky-500 text-white ring-2 ring-neutral-900",
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
    };
  }
  if (type === "follow" || type === "follow_request") {
    return {
      ring: "bg-emerald-500 text-black ring-2 ring-neutral-900",
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>,
    };
  }
  if (type === "recommendation" || type === "rec_rated") {
    return {
      ring: "bg-violet-500 text-white ring-2 ring-neutral-900",
      icon: <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>,
    };
  }
  if (type === "mention") {
    return {
      ring: "bg-amber-500 text-black ring-2 ring-neutral-900",
      icon: <span className="text-[10px] font-bold leading-none">@</span>,
    };
  }
  if (type === "rating_match") {
    return {
      ring: "bg-cyan-500 text-black ring-2 ring-neutral-900",
      icon: <span className="text-[9px] font-bold leading-none tabular-nums">=</span>,
    };
  }
  if (type === "taste_match") {
    return {
      ring: "bg-gradient-to-br from-fuchsia-500 to-emerald-500 text-black ring-2 ring-neutral-900",
      icon: <span className="text-[10px] leading-none">★</span>,
    };
  }
  return {
    ring: "bg-neutral-700 text-neutral-200 ring-2 ring-neutral-900",
    icon: <span className="text-[9px] leading-none">•</span>,
  };
}

function ActivityRowItem({
  a,
  viewerId,
}: {
  a: ActivityRow;
  viewerId: string;
}) {
  const unread = !a.readAt;
  // follow_request rows have inline action buttons and shouldn't be tappable
  // as a whole — clicks could conflict with the Accept/Decline buttons.
  const wholeRowTappable = a.type !== "follow_request";
  const dest = destinationFor(a, viewerId);

  // Streak milestones are the hardest-earned moment in the app. Give
  // them a special celebration card (gradient bg, big flame, large
  // number) instead of folding them into the regular row layout where
  // they read as one of nine identical activity rows.
  if (a.type === "streak_milestone") {
    const m = (a.songId || "").match(/^streak:(\d+):(\d+)$/);
    const days = m?.[1] ?? "";
    const topPct = m?.[2] ?? "";
    return (
      <li>
        <Link
          href={dest}
          className={`relative block rounded-2xl border p-5 overflow-hidden transition-colors ${
            unread
              ? "border-orange-500/50 bg-[radial-gradient(circle_at_top_right,theme(colors.orange.500/0.35),theme(colors.amber.700/0.10)_50%,theme(colors.neutral.950))]"
              : "border-orange-500/30 bg-[radial-gradient(circle_at_top_right,theme(colors.orange.500/0.18),theme(colors.neutral.950)_60%)]"
          }`}
        >
          {unread && (
            <span className="absolute top-3 left-3 h-2 w-2 rounded-full bg-emerald-400" aria-label="unread" />
          )}
          <div className="flex items-center gap-4">
            <div className="text-5xl shrink-0" aria-hidden>🔥</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs uppercase tracking-wider text-orange-300 font-semibold">
                Streak milestone
              </div>
              <div className="text-2xl font-bold tracking-tight">
                <span className="tabular-nums">{days}</span>-day streak
              </div>
              {topPct && (
                <div className="text-xs text-amber-200/80 mt-0.5">
                  Top <span className="tabular-nums">{topPct}%</span> of streak holders
                </div>
              )}
              <div className="text-[11px] text-neutral-400 mt-1">
                {relativeTime(a.createdAt)}
              </div>
            </div>
          </div>
        </Link>
      </li>
    );
  }

  const Inner = (
    <>
      {unread && <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" aria-label="unread" />}
      <span className="relative shrink-0">
        <Avatar
          imageUrl={a.actorImageUrl}
          name={a.actorDisplayName || a.actorUsername}
          seed={a.actorId}
          size={40}
          ring={false}
        />
        <ActivityTypeBadge type={a.type} />
      </span>
      <div className="flex-1 min-w-0 text-sm">
        <div>
          <span className="font-medium">{a.actorDisplayName || a.actorUsername}</span>{" "}
          <span className="text-neutral-400">
            <ActivityVerb a={a} />
          </span>
        </div>
        <div className="text-xs text-neutral-400">{relativeTime(a.createdAt)}</div>
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
  if (a.type === "taste_match") {
    return (
      <>
        also loved
        {a.songTitle ? (
          <>
            {" "}<span className="text-neutral-200">{a.songTitle}</span>
          </>
        ) : (
          " a song you loved"
        )}
        {" "}— taste match
      </>
    );
  }
  if (a.type === "re_rate_nudge") {
    return (
      <>
        Remember{" "}
        {a.songTitle ? (
          <span className="text-neutral-200">{a.songTitle}</span>
        ) : (
          "this one"
        )}
        ? You loved it ages ago — see what&apos;s new.
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
