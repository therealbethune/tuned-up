import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import Image from "next/image";
import { desc, eq, sql } from "drizzle-orm";
import { db, ratings, songs } from "@/db";
import { TunedUpMark } from "@/components/icons";
import { safeQuery } from "@/lib/safe-query";
import { scoreLabel } from "@/lib/score-labels";
import { encodeBase64Url } from "@/lib/encoding";

export const revalidate = 600;

// Logged-out landing page. Server-rendered so we can splash real
// "rated highly recently" content under the hero — gives App Store
// reviewers + first-time visitors a glimpse of actual taste in the
// app instead of fake teaser cards. The query is cached for 10
// minutes (revalidate = 600) so the home page doesn't slam the DB.
export default async function Home() {
  type Teaser = {
    songId: string;
    title: string;
    artist: string;
    thumbnail: string | null;
    avg: number;
    n: number;
  };
  // 4 highest-average songs/albums with at least 2 ratings — small
  // enough to keep the home page lean, big enough to suggest range.
  const teasers = await safeQuery<Teaser[]>(
    () =>
      db
        .select({
          songId: songs.id,
          title: songs.title,
          artist: songs.artist,
          thumbnail: songs.thumbnail,
          avg: sql<number>`round(avg(${ratings.score}))::int`,
          n: sql<number>`count(${ratings.songId})::int`,
        })
        .from(ratings)
        .innerJoin(songs, eq(songs.id, ratings.songId))
        .groupBy(songs.id)
        .having(sql`count(${ratings.songId}) >= 2`)
        .orderBy(desc(sql`avg(${ratings.score})`), desc(sql`count(${ratings.songId})`))
        .limit(4),
    [],
    "home-teaser",
  );

  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.emerald.500/0.18),transparent_55%)]"
      />

      <div className="space-y-10 pt-8 pb-12 sm:pt-16">
        <div className="space-y-6 max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium px-3 py-1">
            <TunedUpMark size={12} />
            Tuned Up
          </span>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] bg-gradient-to-br from-white via-white to-neutral-500 bg-clip-text text-transparent">
            Rate every song.
            <br />
            Follow your taste.
          </h1>
          <p className="text-lg text-neutral-300 max-w-md">
            Score tracks 1&ndash;100, build a profile of your taste, and see what your friends are listening to.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Show when="signed-out">
              <span className="clerk-landing-primary inline-flex">
                <SignUpButton forceRedirectUrl="/welcome">Get started</SignUpButton>
              </span>
              <Link
                href="/discover"
                className="rounded-full border border-neutral-700 px-5 py-2.5 font-medium hover:bg-neutral-900 active:scale-95 transition-transform"
              >
                See what&apos;s trending
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/feed" className="rounded-full bg-white text-black px-5 py-2.5 font-medium active:scale-95 transition-transform">
                Open feed
              </Link>
              <Link href="/search" className="rounded-full border border-neutral-700 px-5 py-2.5 font-medium hover:bg-neutral-900 active:scale-95 transition-transform">
                Find a song
              </Link>
            </Show>
          </div>
        </div>

        {/* Real top-rated rail. Each card is a small clickable preview of
            an actual rating page — proves the app is alive to a fresh
            visitor and gives reviewers a concrete sample to inspect. */}
        {teasers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm uppercase tracking-wider text-neutral-500">Rated highly on Tuned Up</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {teasers.map((t) => (
                <Link
                  key={t.songId}
                  href={`/album/${encodeBase64Url(t.songId)}`}
                  className="group rounded-xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition-colors overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                >
                  <div className="relative">
                    {t.thumbnail ? (
                      <Image
                        src={t.thumbnail}
                        alt=""
                        width={240}
                        height={240}
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="w-full aspect-square object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-neutral-800" />
                    )}
                    <span
                      className={`absolute top-2 right-2 rounded-md bg-black/80 backdrop-blur-sm px-2 py-0.5 text-sm font-bold tabular-nums ${scoreLabel(t.avg).color}`}
                    >
                      {t.avg}
                    </span>
                  </div>
                  <div className="p-3 space-y-0.5">
                    <div className="text-sm font-semibold truncate" title={t.title}>{t.title}</div>
                    <div className="text-xs text-neutral-400 truncate" title={t.artist}>{t.artist}</div>
                    <div className="text-[10px] text-neutral-500 tabular-nums pt-1">
                      {t.n} {t.n === 1 ? "rating" : "ratings"}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Tiny brand-positioning row beneath the rail — concrete claims
            that map to features (no marketing fluff). */}
        <Show when="signed-out">
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-emerald-300 text-xs uppercase tracking-wider mb-1">Granular</div>
              <p className="text-neutral-200">Rate every song 1–100. Stars are too blunt; we use the whole keyboard.</p>
            </li>
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-emerald-300 text-xs uppercase tracking-wider mb-1">Social</div>
              <p className="text-neutral-200">Follow friends, recommend songs back and forth, see whose taste lines up with yours.</p>
            </li>
            <li className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-emerald-300 text-xs uppercase tracking-wider mb-1">Private by default</div>
              <p className="text-neutral-200">Switch your profile to private and only accepted followers see your ratings.</p>
            </li>
          </ul>
        </Show>
      </div>

      {/* Legal footer for logged-out visitors. The App Store reviewer
          lands here from the App Store Connect "Marketing URL" field,
          so the privacy + terms links must be reachable from this
          surface without signing in. Same hygiene as Settings. */}
      <footer className="pt-10 mt-4 border-t border-neutral-800/60 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
        <Link href="/legal/terms" className="hover:text-white">Terms</Link>
        <a href="mailto:support@tuned-up.com" className="hover:text-white">support@tuned-up.com</a>
      </footer>
    </div>
  );
}
