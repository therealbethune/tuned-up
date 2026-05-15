"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PlayIcon } from "./icons";
import { toast } from "@/lib/toast";

// Module-level audio store. There is exactly one <audio> element for
// the whole app and exactly one "currently playing songId" — every
// preview button reads that id via useSyncExternalStore. The audio
// element's own events (pause/ended/error) are what update the id,
// so the UI is always consistent with what's actually audible.
//
// iOS gesture model (most-important detail in this file)
// ──────────────────────────────────────────────────────
// Safari requires `audio.play()` to be invoked SYNCHRONOUSLY inside
// the user-gesture stack — the moment you `await` anything, the
// gesture is consumed and a subsequent `play()` rejects with
// NotAllowedError. Previous fixes tried to dodge this by playing a
// silent WAV inside the click handler to "unlock" the element, but
// that's fragile: the silent payload itself can fail to play on some
// devices, and the awaited fetch that comes next still loses gesture.
//
// The correct fix is structural: ensure `audio.play(url)` is the very
// first thing that runs inside the click handler — no awaits before.
// We get there by aggressively prefetching the preview URL into a
// module cache on mount, on viewport-entry, and on touchstart. By the
// time the user's click fires, the URL is almost always cached and the
// hot path calls `playSync()` synchronously. The cold fallback path
// (cache miss) still works on iOS because the audio element exists
// from a prior interaction; first-tap-no-warm is the only edge case.

let audioEl: HTMLAudioElement | null = null;
let playingSongId: string | null = null;
// Suppresses the synthetic events that fire during a source swap
// (pause from the previous src, error from `removeAttribute("src")`).
// We don't want the UI to flash "nothing playing" between teardown
// and the new play().
let transitioning = false;

const previewUrlCache = new Map<string, string | null>();
// Coalesces concurrent fetches for the same songId — if two buttons
// mount in the same frame both calling prefetchPreviewUrl("X"), they
// share one HTTP roundtrip and one cache update.
const inFlightFetches = new Map<string, Promise<string | null>>();
const subscribers = new Set<() => void>();

function notify() {
  for (const fn of subscribers) fn();
}

function getOrCreateAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const el = document.createElement("audio");
  // "metadata" preload is more reliable than "none" when we swap
  // sources repeatedly on iOS Safari — the element stays properly
  // initialized so subsequent loads actually flush the previous buffer.
  el.preload = "metadata";
  // iOS Safari handles media-session ownership + source swapping far
  // more reliably when the audio element is in the DOM than for
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
    if (transitioning) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  audioEl = el;
  return el;
}

// Public prefetch: caches the previewUrl for a songId. Idempotent;
// concurrent calls share one inflight promise.
function prefetchPreviewUrl(songId: string): Promise<string | null> {
  if (previewUrlCache.has(songId)) {
    return Promise.resolve(previewUrlCache.get(songId)!);
  }
  const existing = inFlightFetches.get(songId);
  if (existing) return existing;
  const p = fetch(`/api/preview-url?songId=${encodeURIComponent(songId)}`)
    .then((r) => r.json())
    .then((j: { previewUrl?: string | null }) => {
      const url: string | null = j.previewUrl ?? null;
      previewUrlCache.set(songId, url);
      inFlightFetches.delete(songId);
      return url;
    })
    .catch(() => {
      previewUrlCache.set(songId, null);
      inFlightFetches.delete(songId);
      return null;
    });
  inFlightFetches.set(songId, p);
  return p;
}

// SYNCHRONOUS play — must be called from inside a user gesture handler
// (no awaits before). The `audio.play()` call here is what iOS Safari
// inspects to decide whether to allow playback; everything before it
// is structural and doesn't break the gesture.
function playSync(songId: string, url: string) {
  const audio = getOrCreateAudio();
  transitioning = true;
  if (audio.src !== url) {
    // Hard cut: stop the previous track, swap src, start the new one.
    // We tried the more aggressive removeAttribute + load + setSrc +
    // load dance before — but on modern Safari, a plain src assignment
    // works AND avoids the spurious "error" event that fires when you
    // load() with no src (which was creating UI state flicker).
    audio.pause();
    audio.src = url;
    audio.load();
  } else if (audio.ended) {
    audio.currentTime = 0;
  }
  playingSongId = songId;
  notify();

  // Fire-and-forget play(). The promise resolves when playback
  // actually starts; rejects if blocked (NotAllowedError on iOS when
  // gesture is lost, NotSupportedError on a bad src). Errors land in
  // the .catch OR fire the "error" event listener — either way we
  // reset state and surface a toast so the user knows the tap registered.
  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.catch((err: { name?: string } | undefined) => {
      if (playingSongId === songId) {
        playingSongId = null;
        notify();
      }
      // NotAllowedError = autoplay-policy blocked. Common on the very
      // first interaction with the page on iOS; subsequent taps work.
      // Tell the user to tap again rather than leave them confused.
      if (err?.name === "NotAllowedError") {
        toast.info("Tap the play button again to start the preview.");
      } else if (err?.name && err.name !== "AbortError") {
        toast.error("Preview couldn't play. Try another song.");
      }
    });
  }

  // Give the swap-related events (pause/error from the previous src)
  // a tick to settle so they don't bleed into clearing the new id.
  setTimeout(() => {
    transitioning = false;
  }, 50);
}

function pauseAudio() {
  if (audioEl) audioEl.pause();
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

// 30-second song preview button. URL prefetched on mount; play() runs
// synchronously inside the click handler so iOS Safari grants gesture
// activation. Hidden entirely if iTunes has no preview for the track.
export function AudioPreviewButton({ songId }: { songId: string }) {
  const currentlyPlaying = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [phase, setPhase] = useState<"idle" | "loading" | "unavailable">("idle");
  const isPlaying = currentlyPlaying === songId;

  // Prefetch on mount via requestIdleCallback so it doesn't fight
  // initial paint. By the time the user taps, the URL is almost
  // always cached and the click handler can play synchronously.
  // If iTunes returns null, we mark the button unavailable
  // immediately (renders nothing) instead of waiting for the user
  // to tap and discover.
  useEffect(() => {
    const cached = previewUrlCache.get(songId);
    if (cached !== undefined) {
      if (cached === null) setPhase("unavailable");
      return;
    }
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    const fire = () => {
      prefetchPreviewUrl(songId).then((url) => {
        if (url === null) setPhase("unavailable");
      });
    };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(fire);
    } else {
      setTimeout(fire, 250);
    }
  }, [songId]);

  // Last-mile prefetch on first touch/hover — gives one more shot at
  // warming the cache before the click event fires. iOS Safari treats
  // touchstart as a distinct gesture from click, so warming here
  // doesn't consume the click's gesture context.
  const warm = useCallback(() => {
    if (!previewUrlCache.has(songId)) {
      void prefetchPreviewUrl(songId);
    }
  }, [songId]);

  const onClick = useCallback(() => {
    if (phase === "unavailable") return;
    if (isPlaying) {
      pauseAudio();
      return;
    }

    // Hot path: URL already cached. Synchronously play — iOS Safari
    // sees audio.play() in the gesture stack and allows it.
    const cached = previewUrlCache.get(songId);
    if (cached !== undefined) {
      if (cached === null) {
        setPhase("unavailable");
        return;
      }
      playSync(songId, cached);
      return;
    }

    // Cold path: URL not cached. We trigger the audio element creation
    // synchronously (which iOS sanctions because we're in a gesture),
    // then fetch, then call play(). On a true cold tap iOS might block
    // the play() call, but second tap works because the element is
    // now user-activated. The aggressive prefetch on mount + touchstart
    // means we almost never hit this path in practice.
    void getOrCreateAudio();
    setPhase("loading");
    prefetchPreviewUrl(songId).then((url) => {
      if (!url) {
        setPhase("unavailable");
        return;
      }
      setPhase("idle");
      playSync(songId, url);
    });
  }, [isPlaying, phase, songId]);

  if (phase === "unavailable") return null;

  return (
    <button
      onClick={onClick}
      onTouchStart={warm}
      onMouseEnter={warm}
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
