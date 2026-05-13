"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SpotifyTopTrack } from "@/lib/spotify-server";
import { scoreLabel } from "@/lib/score-labels";

type Range = "short_term" | "medium_term" | "long_term";

const RANGE_LABEL: Record<Range, string> = {
  short_term: "4 wks",
  medium_term: "6 mos",
  long_term: "All time",
};

// Five quick-tap rating tiers — the whole point of bulk import is that
// you don't have to noodle on exact scores. The center value of each
// emotional bucket gets the tap; the user can still nudge later from
// the regular rating UI if they care.
const CHIPS: { score: number; label: string; emoji: string; className: string }[] = [
  { score: 35, label: "Pass",  emoji: "👎", className: "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" },
  { score: 60, label: "OK",    emoji: "🤷", className: "bg-neutral-800 text-neutral-300 hover:bg-neutral-700" },
  { score: 75, label: "Like",  emoji: "🙂", className: "bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70" },
  { score: 88, label: "Love",  emoji: "🔥", className: "bg-emerald-700/50 text-emerald-200 hover:bg-emerald-600/60" },
  { score: 97, label: "Top",   emoji: "🏆", className: "bg-yellow-600/50 text-yellow-100 hover:bg-yellow-500/60" },
];

type SavedState = "idle" | "saving" | "saved" | "error";

export function BatchRateClient({
  tracks,
  existingScores,
  range: initialRange,
}: {
  tracks: SpotifyTopTrack[];
  existingScores: Record<string, number>;
  range: Range;
}) {
  const router = useRouter();
  const [range, setRange] = useState<Range>(initialRange);
  // Local state: score the user assigned (or pre-existing). Initialize
  // from `existingScores` so already-rated tracks render filled in.
  const [scores, setScores] = useState<Record<string, number>>(existingScores);
  const [states, setStates] = useState<Record<string, SavedState>>({});
  // Track which rows have already been rated as of page load. These
  // count toward "you already rated" UI, not toward this session's
  // "newly rated" counter.
  const initialRatedSet = useMemo(() => new Set(Object.keys(existingScores)), [existingScores]);
  const [newlyRated, setNewlyRated] = useState(0);

  // Switching range navigates to a new server-rendered page. The parent
  // remounts this component with `key={range}`, which means every range
  // switch starts with a fresh state derived from fresh props — no
  // setState-in-effect needed.
  function onChangeRange(r: Range) {
    if (r === range) return;
    setRange(r);
    router.push(`/import/spotify?range=${r}`);
  }

  async function rate(track: SpotifyTopTrack, score: number) {
    const prevScore = scores[track.id];
    const prevState = states[track.id];
    setScores((s) => ({ ...s, [track.id]: score }));
    setStates((s) => ({ ...s, [track.id]: "saving" }));
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          song: {
            id: `spotify:${track.id}`,
            kind: "song",
            title: track.name,
            artist: track.artists.join(", "),
            album: track.album || null,
            thumbnail: track.image,
            durationSeconds: Math.round(track.durationMs / 1000),
          },
          score,
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "save failed"));
      setStates((s) => ({ ...s, [track.id]: "saved" }));
      if (!initialRatedSet.has(track.id) && prevScore == null) {
        setNewlyRated((n) => n + 1);
      }
    } catch {
      // Roll back to prior state on failure so the chip stays usable.
      setStates((s) => ({ ...s, [track.id]: "error" }));
      setScores((s) => {
        const next = { ...s };
        if (prevScore == null) delete next[track.id];
        else next[track.id] = prevScore;
        return next;
      });
      // Clear the error after a moment so the row goes back to normal.
      setTimeout(() => {
        setStates((s) => ({ ...s, [track.id]: prevState ?? "idle" }));
      }, 2500);
    }
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 text-sm text-neutral-400">
        Spotify didn&apos;t return any top tracks for this range yet. Try a different time range, or come back after listening to a few more songs.
        <div className="mt-3">
          <RangeTabs range={range} onChange={onChangeRange} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <RangeTabs range={range} onChange={onChangeRange} />
        <p className="text-xs text-neutral-500 tabular-nums shrink-0">
          {newlyRated > 0 ? `${newlyRated} new` : `${Object.keys(scores).length} rated`}
        </p>
      </div>

      <ul className="space-y-2.5">
        {tracks.map((t) => {
          const s = scores[t.id];
          const state = states[t.id] ?? (initialRatedSet.has(t.id) ? "saved" : "idle");
          return (
            <li
              key={t.id}
              className={`rounded-lg border p-3 transition-colors ${
                state === "saved" || state === "saving"
                  ? "border-emerald-700/40 bg-emerald-950/20"
                  : state === "error"
                    ? "border-red-700/40 bg-red-950/20"
                    : "border-neutral-800 bg-neutral-900/50"
              }`}
            >
              <div className="flex items-center gap-3">
                {t.image ? (
                  <Image
                    src={t.image}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded h-12 w-12 object-cover shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-neutral-800 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-[15px]">{t.name}</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {t.artists.join(", ")}
                  </div>
                </div>
                {s != null && (
                  <div className="shrink-0 flex flex-col items-end leading-tight">
                    {/* Tier-color the number too, not just the label.
                        Was emerald-400 regardless of score, so a 35
                        "Pass" displayed in the same green as an 88
                        "Love". Now matches /discover + /album + /feed. */}
                    <span className={`text-lg font-bold tabular-nums ${scoreLabel(s).color}`}>
                      {s}
                    </span>
                    <span className={`text-[10px] font-medium ${scoreLabel(s).color}`}>
                      {state === "saving" ? "Saving…" : state === "error" ? "Retry" : scoreLabel(s).label}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                {CHIPS.map((c) => {
                  const selected = s === c.score;
                  return (
                    <button
                      key={c.score}
                      onClick={() => rate(t, c.score)}
                      disabled={state === "saving"}
                      aria-label={`${c.label} (${c.score})`}
                      className={`rounded-full px-2 py-1.5 text-[11px] font-semibold active:scale-95 transition-transform disabled:opacity-60 ${
                        selected
                          ? "ring-2 ring-emerald-400 " + c.className
                          : c.className
                      }`}
                    >
                      <span className="mr-0.5" aria-hidden>{c.emoji}</span>
                      <span className="hidden xs:inline">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {newlyRated > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <Link
            href="/feed"
            className="rounded-full bg-white text-black px-5 py-2.5 font-semibold shadow-lg active:scale-95"
          >
            Done · {newlyRated} new → feed
          </Link>
        </div>
      )}

      <p className="text-xs text-neutral-500 text-center pt-2">
        Want to refine a score or add a review? Open the song from your feed and tap your rating to edit.
      </p>
    </div>
  );
}

function RangeTabs({
  range,
  onChange,
}: {
  range: Range;
  onChange: (r: Range) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-neutral-800 p-0.5 text-xs">
      {(["short_term", "medium_term", "long_term"] as Range[]).map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 rounded-full transition-colors ${
            r === range ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white"
          }`}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}
