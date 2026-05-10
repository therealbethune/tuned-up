"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ytUrlForSongId, relativeTime } from "@/lib/songs";
import { scoreLabel } from "@/lib/score-labels";

type ReelItem = {
  id: string;
  songId: string;
  audioUrl: string;
  durationMs: number;
  createdAt: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  title: string;
  artist: string;
  thumbnail: string | null;
  score: number | null;
};

// Vertical swipeable feed: one bite per "screen", autoplay on focus,
// snap-scroll between them. Tap to pause/resume. Show rating context
// alongside the audio player.
export function ReelsViewer({ items }: { items: ReelItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true); // start muted so autoplay works on iOS

  // Track which item is centered using IntersectionObserver, then play it.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.idx);
            setActiveIdx(idx);
          }
        }
      },
      { root: el, threshold: [0.6] },
    );
    el.querySelectorAll("[data-reel]").forEach((c) => obs.observe(c));
    return () => obs.disconnect();
  }, [items.length]);

  // Play active, pause others. Re-runs on activeIdx, paused, muted changes.
  useEffect(() => {
    audioRefs.current.forEach((a, i) => {
      if (!a) return;
      a.muted = muted;
      if (i === activeIdx && !paused) {
        a.currentTime = 0;
        a.play().catch(() => {
          /* autoplay blocked — user must tap unmute */
        });
      } else {
        a.pause();
      }
    });
  }, [activeIdx, paused, muted]);

  // After current bite ends, snap-scroll to the next one.
  function onEnded(i: number) {
    if (i !== activeIdx) return;
    const next = i + 1;
    if (next >= items.length) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-idx="${next}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (items.length === 0) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-8">
        <div className="text-6xl mb-4">🎙️</div>
        <h1 className="text-xl font-bold">No sound bites yet</h1>
        <p className="text-neutral-400 text-sm mt-2 max-w-xs">
          Rate a song, then tap <span className="text-fuchsia-400">Record sound bite</span> to drop a 15-second voice note.
        </p>
        <Link href="/feed" className="mt-6 rounded-full bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-sm font-semibold px-4 py-2">
          Back to feed
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 -my-4 sm:-my-6 fixed inset-0 sm:relative sm:inset-auto bg-black">
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <Link href="/feed" className="text-white/80 hover:text-white text-sm inline-flex items-center gap-1.5">
          ← Feed
        </Link>
        <h1 className="text-white text-sm font-semibold tracking-wide">REELS</h1>
        <button
          onClick={() => setMuted((m) => !m)}
          className="text-white/80 hover:text-white text-sm inline-flex items-center gap-1"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          )}
        </button>
      </div>

      {/* Snap-scroll container */}
      <div
        ref={containerRef}
        className="h-[100dvh] sm:h-[calc(100vh-2rem)] overflow-y-scroll snap-y snap-mandatory"
      >
        {items.map((it, i) => {
          const yt = ytUrlForSongId(it.songId);
          const label = it.score != null ? scoreLabel(it.score) : null;
          return (
            <section
              key={it.id}
              data-reel
              data-idx={i}
              onClick={() => setPaused((p) => !p)}
              className="relative h-[100dvh] sm:h-[calc(100vh-2rem)] snap-start flex items-end justify-center overflow-hidden cursor-pointer"
            >
              {/* Background: blurred album art */}
              {it.thumbnail ? (
                <Image
                  src={it.thumbnail}
                  alt=""
                  fill
                  className="object-cover blur-2xl scale-125 opacity-60"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-900 to-black" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/90" />

              {/* Centered album art */}
              <div className="absolute inset-0 flex items-center justify-center pb-32">
                {it.thumbnail ? (
                  <Image
                    src={it.thumbnail}
                    alt=""
                    width={280}
                    height={280}
                    className="rounded-2xl shadow-2xl object-cover h-64 w-64 sm:h-72 sm:w-72"
                  />
                ) : (
                  <div className="h-64 w-64 sm:h-72 sm:w-72 rounded-2xl bg-neutral-800" />
                )}
              </div>

              {/* Pause overlay */}
              {paused && i === activeIdx && (
                <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                  <div className="rounded-full bg-black/60 p-5">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="white" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}

              {/* Bottom card */}
              <div className="relative z-10 w-full max-w-md p-6 space-y-3 text-white">
                <Link
                  href={`/u/${it.username}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  {it.imageUrl ? (
                    <Image src={it.imageUrl} alt="" width={28} height={28} className="rounded-full h-7 w-7" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-neutral-700" />
                  )}
                  <span className="font-medium">@{it.username}</span>
                  <span className="text-xs text-white/60">· {relativeTime(it.createdAt)}</span>
                </Link>

                <div>
                  <div className="text-xl font-bold leading-tight truncate">
                    {yt ? (
                      <a href={yt} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {it.title}
                      </a>
                    ) : (
                      it.title
                    )}
                  </div>
                  <div className="text-sm text-white/70 truncate">{it.artist}</div>
                </div>

                {it.score != null && label && (
                  <div className="inline-flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums">{it.score}</span>
                    <span className={`text-sm font-semibold ${label.color}`}>{label.label}</span>
                  </div>
                )}

                {/* Audio element (hidden) — controls are global at top */}
                <audio
                  ref={(el) => { audioRefs.current[i] = el; }}
                  src={it.audioUrl}
                  preload={Math.abs(i - activeIdx) <= 1 ? "auto" : "none"}
                  onEnded={() => onEnded(i)}
                />

                {/* Progress + duration hint */}
                <div className="text-xs text-white/60 inline-flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
                  </svg>
                  <span>{Math.round(it.durationMs / 1000)}s sound bite</span>
                  {muted && <span className="ml-2 text-fuchsia-300">Tap 🔊 to unmute</span>}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
