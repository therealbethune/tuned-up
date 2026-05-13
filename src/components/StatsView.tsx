import Image from "next/image";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, ratings, songs, users } from "@/db";
import { ytUrlForSongId } from "@/lib/songs";
import { scoreLabel } from "@/lib/score-labels";

type User = typeof users.$inferSelect;

export default async function StatsView({
  target,
  isOwner,
}: {
  target: User;
  isOwner: boolean;
}) {
  // Aggregate everything we need from the rating table in a single query
  // (total/avg/min/max + the 10 score-bin counts) instead of fetching every
  // rating row and computing histogram in JS. For users with 1000+ ratings
  // this drops the page from "load 1000 rows" to "load 1 row".
  //
  // Streak is sourced from target.currentStreak (cached on the user row,
  // refreshed on every rating insert via refreshUserStreak) — not a live
  // computeStreak() call. The live version re-fetched every rating the
  // user has ever made just to count consecutive days, which the cached
  // column was specifically introduced to avoid (same comment as the
  // profile page's Wave G fix).
  const streak = target.currentStreak ?? 0;

  const [aggResult, topSongs, topArtists, monthly] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COALESCE(ROUND(AVG(score))::int, 0) AS avg,
        COALESCE(MIN(score), 0) AS min,
        COALESCE(MAX(score), 0) AS max,
        COUNT(*) FILTER (WHERE score BETWEEN 1 AND 10)::int AS b0,
        COUNT(*) FILTER (WHERE score BETWEEN 11 AND 20)::int AS b1,
        COUNT(*) FILTER (WHERE score BETWEEN 21 AND 30)::int AS b2,
        COUNT(*) FILTER (WHERE score BETWEEN 31 AND 40)::int AS b3,
        COUNT(*) FILTER (WHERE score BETWEEN 41 AND 50)::int AS b4,
        COUNT(*) FILTER (WHERE score BETWEEN 51 AND 60)::int AS b5,
        COUNT(*) FILTER (WHERE score BETWEEN 61 AND 70)::int AS b6,
        COUNT(*) FILTER (WHERE score BETWEEN 71 AND 80)::int AS b7,
        COUNT(*) FILTER (WHERE score BETWEEN 81 AND 90)::int AS b8,
        COUNT(*) FILTER (WHERE score BETWEEN 91 AND 100)::int AS b9
      FROM ratings WHERE user_id = ${target.id}
    `),
    db
      .select({
        songId: songs.id,
        title: songs.title,
        artist: songs.artist,
        thumbnail: songs.thumbnail,
        score: ratings.score,
      })
      .from(ratings)
      .innerJoin(songs, eq(ratings.songId, songs.id))
      .where(eq(ratings.userId, target.id))
      .orderBy(desc(ratings.score), desc(ratings.createdAt))
      .limit(10),
    db
      .select({
        artist: songs.artist,
        n: sql<number>`count(*)::int`,
        avg: sql<number>`round(avg(${ratings.score}))::int`,
      })
      .from(ratings)
      .innerJoin(songs, eq(ratings.songId, songs.id))
      .where(eq(ratings.userId, target.id))
      .groupBy(songs.artist)
      .orderBy(desc(sql`count(*)`))
      .limit(8),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${ratings.createdAt}), 'YYYY-MM')`,
        n: sql<number>`count(*)::int`,
      })
      .from(ratings)
      .where(eq(ratings.userId, target.id))
      .groupBy(sql`date_trunc('month', ${ratings.createdAt})`)
      .orderBy(sql`date_trunc('month', ${ratings.createdAt})`),
  ]);

  // Drizzle's neon-http `db.execute` returns either an array or
  // { rows: [...] }; tolerate both.
  const aggRaw = aggResult as unknown;
  const aggRows = Array.isArray(aggRaw)
    ? (aggRaw as Array<Record<string, number>>)
    : Array.isArray((aggRaw as { rows?: Array<Record<string, number>> })?.rows)
      ? ((aggRaw as { rows: Array<Record<string, number>> }).rows)
      : [];
  const agg = aggRows[0] ?? { total: 0, avg: 0, min: 0, max: 0 };
  const total = Number(agg.total ?? 0);
  const avg = Number(agg.avg ?? 0);
  const min = Number(agg.min ?? 0);
  const max = Number(agg.max ?? 0);
  const bins = [
    Number(agg.b0 ?? 0), Number(agg.b1 ?? 0), Number(agg.b2 ?? 0), Number(agg.b3 ?? 0),
    Number(agg.b4 ?? 0), Number(agg.b5 ?? 0), Number(agg.b6 ?? 0), Number(agg.b7 ?? 0),
    Number(agg.b8 ?? 0), Number(agg.b9 ?? 0),
  ];
  const maxBin = Math.max(1, ...bins);
  const maxMonth = Math.max(1, ...monthly.map((m) => m.n));

  const heading = isOwner ? "Your stats" : `${target.displayName || target.username}'s stats`;
  const backHref = isOwner ? "/me" : `/u/${target.username}`;

  if (total === 0) {
    return (
      <div className="space-y-6">
        <Link href={backHref} className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center text-neutral-400">
          <p>Nothing to show yet.</p>
          {isOwner && (
            <p className="text-sm mt-2">
              <Link href="/search" className="underline text-white">Rate some songs</Link> and come back.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link href={backHref} className="text-sm text-neutral-400 hover:text-white">← Profile</Link>
        <h1 className="text-2xl font-bold mt-1">{heading}</h1>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
        <Stat label="Songs rated" value={total.toString()} />
        <Stat
          label="Average"
          value={avg.toString()}
          sublabel={scoreLabel(avg).label}
          accent="emerald"
        />
        <Stat label="Highest" value={max.toString()} sublabel={scoreLabel(max).label} />
        <Stat label="Lowest" value={min.toString()} sublabel={scoreLabel(min).label} />
        <Stat
          label="Streak"
          value={streak > 0 ? `🔥 ${streak}` : "—"}
          sublabel={streak > 0 ? (streak === 1 ? "day" : "days") : undefined}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Score distribution</h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <div className="flex items-end gap-1.5 h-40">
            {bins.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end">
                <div className="text-[10px] text-neutral-500 mb-1 tabular-nums">{n || ""}</div>
                <div
                  className="w-full rounded-t-sm transition-colors bar-grow-vertical"
                  style={{
                    height: `${(n / maxBin) * 100}%`,
                    minHeight: n > 0 ? "4px" : "0",
                    background: `linear-gradient(180deg, ${binColor(i)} 0%, ${binColor(i)}99 100%)`,
                    animationDelay: `${i * 40}ms`,
                  }}
                  title={`${i * 10 + 1}-${(i + 1) * 10}: ${n}`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {bins.map((_, i) => (
              <div key={i} className="flex-1 text-center text-[10px] text-neutral-500 tabular-nums">
                {i * 10 + 1}
              </div>
            ))}
          </div>
        </div>
      </section>

      {monthly.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Ratings over time</h2>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="flex items-end gap-1 h-32">
              {monthly.map((m, i) => (
                <div
                  key={m.month}
                  className="flex-1 flex flex-col items-center justify-end"
                  title={`${m.month}: ${m.n}`}
                >
                  <div
                    className="w-full bg-sky-500/80 rounded-t-sm bar-grow-vertical"
                    style={{
                      height: `${(m.n / maxMonth) * 100}%`,
                      minHeight: m.n > 0 ? "4px" : "0",
                      animationDelay: `${i * 25}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1.5 overflow-x-auto">
              {monthly.map((m) => (
                <div key={m.month} className="flex-1 text-center text-[10px] text-neutral-500 min-w-8">
                  {monthLabel(m.month)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Most rated artists</h2>
        <ul className="space-y-2">
          {topArtists.map((a) => (
            <li
              key={a.artist}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{a.artist}</div>
                <div className="text-xs text-neutral-500">
                  {a.n} {a.n === 1 ? "rating" : "ratings"} · avg {a.avg}
                </div>
              </div>
              <div
                className="h-2 rounded-full bg-emerald-500/60"
                style={{
                  width: `${Math.max(20, (a.n / topArtists[0].n) * 80)}px`,
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{isOwner ? "Your" : "Their"} top songs</h2>
        <ul className="space-y-2">
          {topSongs.map((s) => {
            const url = ytUrlForSongId(s.songId);
            return (
              <li
                key={s.songId}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
              >
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
                    {s.thumbnail ? (
                      <Image src={s.thumbnail} alt="" width={40} height={40} className="rounded h-10 w-10 object-cover" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-neutral-800" />
                    )}
                  </a>
                ) : s.thumbnail ? (
                  <Image src={s.thumbnail} alt="" width={40} height={40} className="rounded h-10 w-10 object-cover shrink-0" />
                ) : (
                  <div className="h-10 w-10 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="font-medium truncate block hover:underline">
                      {s.title}
                    </a>
                  ) : (
                    <div className="font-medium truncate">{s.title}</div>
                  )}
                  <div className="text-sm text-neutral-400 truncate">{s.artist}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold tabular-nums">{s.score}</div>
                  <div className={`text-[10px] font-medium ${scoreLabel(s.score).color}`}>
                    {scoreLabel(s.score).label}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: "emerald";
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <div className="text-neutral-400 text-xs uppercase tracking-wider">{label}</div>
      <div
        className={`text-2xl font-bold tabular-nums mt-1 ${
          accent === "emerald" ? "text-emerald-400" : ""
        }`}
      >
        {value}
      </div>
      {sublabel && <div className="text-xs text-neutral-500">{sublabel}</div>}
    </div>
  );
}

// Color the histogram bins along a red→green gradient so you can read the
// shape of someone's taste at a glance.
function binColor(i: number): string {
  // i=0 (1-10): red, i=9 (91-100): emerald
  const hues = [
    "#ef4444", "#f97316", "#f59e0b", "#eab308",
    "#a3e635", "#84cc16", "#65a30d", "#22c55e", "#16a34a", "#10b981",
  ];
  return hues[i] ?? "#10b981";
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1] ?? m} ${y.slice(2)}`;
}
