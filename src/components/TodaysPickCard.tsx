import Image from "next/image";
import Link from "next/link";
import type { DailyPick } from "@/lib/daily-pick";
import { RateButton } from "@/components/RateButton";
import { AudioPreviewButton } from "@/components/AudioPreviewButton";
import { scoreLabel } from "@/lib/score-labels";
import { encodeBase64Url } from "@/lib/encoding";
import { isAlbumId } from "@/lib/songs";
import { PlayIcon } from "@/components/icons";

// Daily pick card pinned to the top of /feed. Same song for everyone
// on a given UTC day (deterministic-by-date picker in lib/daily-pick).
// Drives streak retention — every time the user opens /feed there's
// a fresh prompt waiting that takes ~3 taps to clear. Renders nothing
// if the catalog is too small to pick from.
export function TodaysPickCard({ pick }: { pick: DailyPick }) {
  const songLike = {
    id: pick.songId,
    kind: pick.kind,
    title: pick.title,
    artist: pick.artist,
    album: pick.album,
    thumbnail: pick.thumbnail,
    durationSeconds: pick.durationSeconds,
  };
  return (
    <section
      aria-label="Today's pick"
      className="relative rounded-2xl border border-emerald-500/40 bg-[radial-gradient(circle_at_top_left,theme(colors.emerald.500/0.18),theme(colors.neutral.950)_70%)] shadow-[0_0_60px_-30px_theme(colors.emerald.500/0.5)] overflow-hidden"
    >
      <div className="flex items-center gap-3 px-3 sm:px-4 pt-3 pb-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5">
          ★ Today&rsquo;s pick
        </span>
        <span className="text-xs text-neutral-400">
          {pick.alreadyRated ? "You already rated this one — nice." : "A daily prompt to keep your streak alive."}
        </span>
      </div>
      <div className="flex items-center gap-3 px-3 sm:px-4 pb-3">
        <Link
          href={`/album/${encodeBase64Url(pick.songId)}`}
          className="relative shrink-0 group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 rounded"
          title="Open this rating page"
        >
          {pick.thumbnail ? (
            <Image
              src={pick.thumbnail}
              alt=""
              width={72}
              height={72}
              sizes="72px"
              className="rounded h-16 w-16 sm:h-[72px] sm:w-[72px] object-cover ring-1 ring-neutral-800"
              priority
            />
          ) : (
            <div className="h-16 w-16 sm:h-[72px] sm:w-[72px] rounded bg-neutral-800" />
          )}
          <span className="absolute inset-0 rounded flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors text-white">
            <PlayIcon size={20} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            href={`/album/${encodeBase64Url(pick.songId)}`}
            className="font-semibold text-base truncate block hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 rounded"
          >
            {pick.title}
          </Link>
          <div className="text-sm text-neutral-400 truncate">{pick.artist}</div>
          <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
            {pick.avgScore > 0 && (
              <span className={`tabular-nums ${scoreLabel(pick.avgScore).color}`}>
                {pick.avgScore} avg
              </span>
            )}
            <span>·</span>
            <span className="tabular-nums">
              {pick.ratingCount} {pick.ratingCount === 1 ? "rating" : "ratings"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {pick.alreadyRated ? (
            <span className="text-[11px] text-emerald-300 font-semibold inline-flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
              Picked it
            </span>
          ) : (
            <RateButton song={songLike} initialScore={null} />
          )}
          {!isAlbumId(pick.songId) && <AudioPreviewButton songId={pick.songId} />}
        </div>
      </div>
    </section>
  );
}
