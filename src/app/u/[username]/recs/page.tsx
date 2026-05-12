import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, users, recommendations, songs, ratings } from "@/db";
import { ytUrlForSongId, isAlbumId, relativeTime } from "@/lib/songs";
import { encodeBase64Url } from "@/lib/encoding";

export const dynamic = "force-dynamic";

// Recommendation history between the viewer and one other user.
// Two columns: "You sent" (viewer → them) and "They sent" (them → viewer).
// Each row shows the song, when it was sent, optional message, and a
// status badge (rated / pending / dismissed). Rated rows link to the
// recipient's rating page so you can immediately see the verdict.
export default async function RecHistoryPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const { username } = await params;

  const [other] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!other) notFound();
  if (other.id === userId) redirect("/me");

  // Pull every rec where (viewer → other) or (other → viewer).
  const rows = await db
    .select({
      id: recommendations.id,
      fromUserId: recommendations.fromUserId,
      toUserId: recommendations.toUserId,
      message: recommendations.message,
      status: recommendations.status,
      createdAt: recommendations.createdAt,
      songId: songs.id,
      title: songs.title,
      artist: songs.artist,
      thumbnail: songs.thumbnail,
    })
    .from(recommendations)
    .innerJoin(songs, eq(songs.id, recommendations.songId))
    .where(
      or(
        and(
          eq(recommendations.fromUserId, userId),
          eq(recommendations.toUserId, other.id),
        ),
        and(
          eq(recommendations.fromUserId, other.id),
          eq(recommendations.toUserId, userId),
        ),
      ),
    )
    .orderBy(desc(recommendations.createdAt));

  const youSent = rows.filter((r) => r.fromUserId === userId);
  const theySent = rows.filter((r) => r.fromUserId === other.id);

  // For "rated" recs, look up the recipient's rating so we can show the
  // score inline ("You rated 79" / "They rated 88").
  const ratedSongIds = rows
    .filter((r) => r.status === "rated")
    .map((r) => r.songId);
  type RatingMap = Map<string, { score: number; raterId: string }>;
  const ratingsMap: RatingMap = new Map();
  if (ratedSongIds.length) {
    // Scope to the actual rec songs, not every rating either user has ever
    // made — without this, a user with 5k ratings made the page fetch 10k
    // rows just to find ~50.
    const rs = await db
      .select({ userId: ratings.userId, songId: ratings.songId, score: ratings.score })
      .from(ratings)
      .where(
        and(
          or(eq(ratings.userId, userId), eq(ratings.userId, other.id)),
          inArray(ratings.songId, ratedSongIds),
        ),
      );
    for (const r of rs) {
      ratingsMap.set(`${r.userId}::${r.songId}`, { score: r.score, raterId: r.userId });
    }
  }

  function recipientScore(r: typeof rows[number]) {
    return ratingsMap.get(`${r.toUserId}::${r.songId}`)?.score ?? null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/u/${other.username}`} className="text-sm text-neutral-400 hover:text-white">
          ← @{other.username}
        </Link>
        <h1 className="text-2xl font-bold mt-1">Rec history</h1>
        <p className="text-sm text-neutral-400 mt-0.5">
          Songs you and @{other.username} have recommended each other.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center text-neutral-500">
          No recommendations yet between you two.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          <Column
            heading={`You sent (${youSent.length})`}
            empty={`You haven't sent @${other.username} any songs yet.`}
            rows={youSent}
            otherUsername={other.username}
            recipientScoreOf={recipientScore}
            direction="outgoing"
          />
          <Column
            heading={`They sent (${theySent.length})`}
            empty={`@${other.username} hasn't sent you any songs yet.`}
            rows={theySent}
            otherUsername={other.username}
            recipientScoreOf={recipientScore}
            direction="incoming"
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, score }: { status: string; score: number | null }) {
  if (status === "rated" && score != null) {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Rated {score}
      </span>
    );
  }
  if (status === "rated") {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        Rated
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-400 border border-neutral-600">
        Dismissed
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
      Pending
    </span>
  );
}

type RecRow = {
  id: string;
  songId: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  message: string | null;
  status: string;
  createdAt: Date;
  fromUserId: string;
  toUserId: string;
};

function Column({
  heading,
  empty,
  rows,
  otherUsername,
  recipientScoreOf,
  direction,
}: {
  heading: string;
  empty: string;
  rows: RecRow[];
  otherUsername: string;
  recipientScoreOf: (r: RecRow) => number | null;
  direction: "outgoing" | "incoming";
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-2">
        {heading}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const score = recipientScoreOf(r);
            const yt = ytUrlForSongId(r.songId);
            // For "outgoing" (you → them) rated recs, link to their rating
            // page for this song. For "incoming" (them → you) rated recs,
            // link to your own rating page.
            const ratedHref =
              r.status === "rated"
                ? `/r/${
                    direction === "outgoing" ? otherUsername : "" /* viewer */
                  }/${encodeBase64Url(r.songId)}`
                : null;
            const cardWrapClass = "block rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 hover:border-neutral-700 transition-colors";
            const inner = (
              <div className="flex items-center gap-3">
                {r.thumbnail ? (
                  <Image src={r.thumbnail} alt="" width={44} height={44} className="rounded h-11 w-11 object-cover shrink-0" />
                ) : (
                  <div className="h-11 w-11 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.title}</span>
                    {isAlbumId(r.songId) && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        Album
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400 truncate">{r.artist}</div>
                  {r.message && (
                    <div className="text-xs text-neutral-300 italic mt-1 truncate">
                      &ldquo;{r.message}&rdquo;
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-neutral-500">
                    <StatusBadge status={r.status} score={score} />
                    <span>{relativeTime(r.createdAt)}</span>
                    {yt && (
                      <a
                        href={yt}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neutral-400 hover:text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ▸ Play
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
            if (ratedHref && direction === "outgoing") {
              return (
                <li key={r.id}>
                  <Link href={ratedHref} className={cardWrapClass}>
                    {inner}
                  </Link>
                </li>
              );
            }
            return (
              <li key={r.id} className={cardWrapClass}>
                {inner}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
