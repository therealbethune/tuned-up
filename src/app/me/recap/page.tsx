import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ratings, songs, users } from "@/db";
import { safeQuery } from "@/lib/safe-query";
import { scoreLabel } from "@/lib/score-labels";
import { encodeBase64Url } from "@/lib/encoding";
import { ShareButton } from "@/components/ShareButton";
import { isAlbumId } from "@/lib/songs";
import { WEEK_MS } from "@/lib/time-constants";

export const dynamic = "force-dynamic";

// /me/recap — "your week in music" recap page. Highlights the user's
// top-rated songs from the last 7 days, total ratings, average, and
// a sharable URL. Designed to be the thing a user opens on a Sunday
// to see what they listened to and pat themselves on the back. Pure
// read on existing data — no schema changes needed.
export default async function WeeklyRecapPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const sevenDaysAgo = new Date(Date.now() - WEEK_MS);

  type WeekRow = {
    score: number;
    review: string | null;
    createdAt: Date;
    songId: string;
    title: string;
    artist: string;
    thumbnail: string | null;
    kind: string;
  };

  const [thisWeek, [me], [overallStat]] = await Promise.all([
    safeQuery(
      () =>
        db
          .select({
            score: ratings.score,
            review: ratings.review,
            createdAt: ratings.createdAt,
            songId: songs.id,
            title: songs.title,
            artist: songs.artist,
            thumbnail: songs.thumbnail,
            kind: songs.kind,
          })
          .from(ratings)
          .innerJoin(songs, eq(songs.id, ratings.songId))
          .where(and(eq(ratings.userId, userId), gte(ratings.createdAt, sevenDaysAgo)))
          .orderBy(desc(ratings.score), desc(ratings.createdAt))
          .limit(50),
      [] as WeekRow[],
      "weekly-recap",
    ),
    db
      .select({ username: users.username, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    safeQuery(
      () =>
        db
          .select({
            avg: sql<number>`coalesce(round(avg(${ratings.score}))::int, 0)`,
            n: sql<number>`count(*)::int`,
          })
          .from(ratings)
          .where(and(eq(ratings.userId, userId), gte(ratings.createdAt, sevenDaysAgo))),
      [{ avg: 0, n: 0 }],
      "weekly-recap-agg",
    ),
  ]);
  const total = Number(overallStat?.n ?? 0);
  const avg = Number(overallStat?.avg ?? 0);
  const top5 = thisWeek.slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/me" className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">Your week in music</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Last 7 days. Updated live; come back next week for a fresh recap.
        </p>
      </div>

      {total === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center space-y-3">
          <div className="text-4xl">🌑</div>
          <h2 className="text-lg font-semibold">Quiet week</h2>
          <p className="text-sm text-neutral-400 max-w-sm mx-auto">
            Rate at least one song this week and a recap appears here.
          </p>
          <Link
            href="/feed"
            className="inline-block rounded-full bg-white text-black text-sm font-semibold px-4 py-2 mt-2"
          >
            Open feed
          </Link>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:p-4">
              <div className="text-3xl font-bold tabular-nums">{total}</div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mt-1">
                {total === 1 ? "rating" : "ratings"}
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:p-4">
              <div className={`text-3xl font-bold tabular-nums ${scoreLabel(avg).color}`}>
                {avg}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mt-1">
                Avg score
              </div>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:p-4">
              <div className="text-3xl font-bold tabular-nums">{top5[0]?.score ?? "—"}</div>
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mt-1">
                Best
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Top of the week
            </h2>
            <ul className="space-y-2">
              {top5.map((r) => (
                <li key={r.songId}>
                  <Link
                    href={`/album/${encodeBase64Url(r.songId)}`}
                    className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 hover:border-neutral-700 transition-colors p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                  >
                    {r.thumbnail ? (
                      <Image
                        src={r.thumbnail}
                        alt=""
                        width={48}
                        height={48}
                        sizes="48px"
                        className="rounded h-12 w-12 object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-neutral-800 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-neutral-400 truncate">{r.artist}</div>
                      {isAlbumId(r.songId) && (
                        <div className="text-[10px] uppercase tracking-wider text-sky-300 mt-0.5">Album</div>
                      )}
                    </div>
                    <div className="text-right shrink-0 leading-tight">
                      <div className={`text-2xl font-bold tabular-nums ${scoreLabel(r.score).color}`}>
                        {r.score}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                        {scoreLabel(r.score).label}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {me && top5[0] && (
            <section className="flex items-center gap-3">
              <ShareButton username={me.username} songId={top5[0].songId} />
              <p className="text-xs text-neutral-500">
                Share your top of the week with anyone.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
