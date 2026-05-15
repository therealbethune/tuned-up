"use client";
import { useCallback, useState, useSyncExternalStore } from "react";
import { PlayIcon } from "./icons";

// Module-level audio store. There is exactly one <audio> element for
// the whole app and exactly one "currently playing songId" — every
// preview button reads that id via useSyncExternalStore. The audio
// element's own events (pause/ended/error) are what update the id, so
// the UI is always consistent with what's actually audible: no event
// bus, no per-button state to desync.

let audioEl: HTMLAudioElement | null = null;
let playingSongId: string | null = null;
// Suppresses the synthetic "pause" event that fires while we're in
// the middle of swapping sources — we don't want the UI to briefly
// flash "nothing playing" between teardown and the new play().
let transitioning = false;
// iOS Safari requires audio.play() to be invoked synchronously inside
// the user-gesture stack — `await fetch(...)` blows that window. We
// "unlock" the element on the very first user click by calling play()
// on a silent payload, which Safari then treats as a sanctioned media
// element for the rest of the session. Subsequent src swaps + plays
// work without gesture-context fights.
let unlocked = false;
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
const previewUrlCache = new Map<string, string | null>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function getAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const el = document.createElement("audio");
  // "metadata" is more reliable than "none" when we're going to swap
  // sources repeatedly on iOS Safari — the element stays properly
  // initialized so the teardown path below actually flushes the
  // previous buffer.
  el.preload = "metadata";
  // iOS Safari handles media-session ownership and source swapping
  // far more reliably when the audio element is in the DOM than for
  // detached `new Audio()` instances.
  el.style.position = "fixed";
  el.style.visibility = "hidden";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  el.addEventListener("pause", () => {
    if (transitioning) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  el.addEventListener("ended", () => {
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  el.addEventListener("error", () => {
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  audioEl = el;
  return el;
}

async function fetchPreviewUrl(songId: string): Promise<string | null> {
  if (previewUrlCache.has(songId)) return previewUrlCache.get(songId)!;
  try {
    const res = await fetch(
      `/api/preview-url?songId=${encodeURIComponent(songId)}`,
    );
    const j = await res.json();
    const url: string | null = j.previewUrl ?? null;
    previewUrlCache.set(songId, url);
    return url;
  } catch {
    previewUrlCache.set(songId, null);
    return null;
  }
}

async function play(songId: string, url: string) {
  const audio = getAudio();
  transitioning = true;
  try {
    if (audio.src !== url) {
      // Aggressive teardown: pause → detach src → load (flush buffer)
      // → set new src → load. A simple `audio.src = url` mid-playback
      // is not a hard cut on iOS Safari — the previous track keeps
      // playing from its already-buffered data while the new source
      // loads, which is exactly what surfaced as "I tapped song B but
      // song A is still playing".
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.src = url;
      audio.load();
    } else if (audio.ended) {
      audio.currentTime = 0;
    }
    playingSongId = songId;
    notify();
    await audio.play();
  } catch {
    if (playingSongId === songId) {
      playingSongId = null;
      notify();
    }
  } finally {
    transitioning = false;
  }
}

function pause() {
  if (audioEl) audioEl.pause();
}

// Call this synchronously inside the click handler — BEFORE any
// await. It plays a 1-frame silent WAV so iOS Safari registers the
// audio element as user-activated. Returns a promise we don't have
// to await for the gesture to count.
function primeIfNeeded() {
  if (unlocked) return;
  const audio = getAudio();
  // Stash the current src/state so the unlock doesn't disrupt
  // an in-progress preview if any.
  const wasPaused = audio.paused;
  const prevSrc = audio.src;
  if (wasPaused) {
    audio.src = SILENT_WAV;
    audio.load();
    // Fire and forget. Promise rejection means audio is blocked
    // (autoplay policy) — we'll try again on the next gesture.
    audio.play().then(
      () => {
        unlocked = true;
        audio.pause();
        if (prevSrc) {
          audio.src = prevSrc;
          audio.load();
        } else {
          audio.removeAttribute("src");
        }
      },
      () => {
        // Still failed — leave unlocked=false so we'll try again.
      },
    );
  }
}

function subscribe(fn: () => void) {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function getSnapshot() {
  return playingSongId;
}

function getServerSnapshot(): string | null {
  return null;
}

// 30-second song preview button. Lazy-fetches the iTunes previewUrl
// on first tap, plays via the module-shared audio element. Touch
// target 36×36 (within the row of action buttons) but enlarged to
// 44×44 via padding to satisfy WCAG.
export function AudioPreviewButton({ songId }: { songId: string }) {
  const currentlyPlaying = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [phase, setPhase] = useState<"idle" | "loading" | "unavailable">("idle");

  const isPlaying = currentlyPlaying === songId;

  const onClick = useCallback(async () => {
    if (phase === "loading" || phase === "unavailable") return;
    if (isPlaying) {
      pause();
      return;
    }
    // Synchronously prime the audio element BEFORE any await so iOS
    // Safari treats subsequent play() calls as user-activated. Without
    // this, fetchPreviewUrl's await loses the gesture context and the
    // real audio.play() rejects with NotAllowedError on first tap.
    primeIfNeeded();
    setPhase("loading");
    const url = await fetchPreviewUrl(songId);
    if (!url) {
      setPhase("unavailable");
      return;
    }
    setPhase("idle");
    await play(songId, url);
  }, [isPlaying, phase, songId]);

  if (phase === "unavailable") return null;

  return (
    <button
      onClick={onClick}
      disabled={phase === "loading"}
      aria-label={isPlaying ? "Pause preview" : "Play 30-second preview"}
      title={isPlaying ? "Pause" : "30-second preview"}
      className={`inline-flex items-center justify-center h-11 w-11 rounded-full transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
        isPlaying
          ? "bg-emerald-500 text-black"
          : "bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700"
      } disabled:opacity-60`}
    >
      {phase === "loading" ? (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-neutral-500 border-t-white animate-spin" />
      ) : isPlaying ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <PlayIcon size={14} />
      )}
    </button>
  );
}
