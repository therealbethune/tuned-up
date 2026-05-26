"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { PlayIcon } from "./icons";

// ──── iOS Safari background ────────────────────────────────────────
// Safari blocks `audio.play()` outside a user-gesture stack. The
// gesture is consumed by the FIRST `await` in the click handler — so
// any code that does `await fetch(...)` then `await audio.play()` is
// permanently broken on iOS first-tap. That's the bug we've been
// fighting in five previous rewrites.
//
// The rule that actually works:
//   1. audio.play() MUST be called synchronously inside the click
//      event handler (no awaits before it).
//   2. Once an <audio> element has been activated by a sync play()
//      call inside a gesture, FUTURE play() calls on that same
//      element work even after async work.
//
// Strategy here:
//   • EAGER PREFETCH the URL on mount via requestIdleCallback and on
//     touchstart/mouseenter. By the time the user clicks, the URL is
//     almost always already in `urlCache` and we hit the HOT PATH —
//     a single synchronous `audio.src = url; audio.play()`.
//   • COLD FALLBACK: if click happens before prefetch finishes, we
//     play a 1-sample silent WAV synchronously to ACTIVATE the audio
//     element (iOS treats this as a user-gesture play), then fetch
//     the real URL and swap src + play. The second play() works
//     because the element is now permanently user-activated.
//
// History: the previous version `await fetch(...)`-then-`await play()`
// failed on every iOS first-tap. Before that, an even more elaborate
// rewrite tried `useSyncExternalStore` + DOM-attached audio + preload
// "metadata" and broke even more cases. This file's goal is to be
// SIMPLE and CORRECT, not clever.

// ──── Module-level state (singleton audio coordinator) ─────────────

let audioEl: HTMLAudioElement | null = null;
let playingSongId: string | null = null;
// Counts in-flight source swaps. While > 0 we ignore audio-element
// events (pause/error) that would otherwise look like "the current
// preview stopped" — because they're really side effects of our own
// teardown. Counter instead of a boolean so overlapping rapid swaps
// can't accidentally re-enable event handling mid-swap.
let swapDepth = 0;

type PreviewMeta = {
  url: string | null;
  title?: string;
  artist?: string;
  album?: string | null;
  thumbnail?: string | null;
};
const urlCache = new Map<string, PreviewMeta>();
const inFlight = new Map<string, Promise<PreviewMeta>>();
const subs = new Set<() => void>();

// 45-byte silent WAV (1 sample, 8kHz, 8-bit mono). Used to activate
// the audio element synchronously inside a click handler on iOS when
// we don't yet have the real preview URL. Playing this is essentially
// instantaneous and inaudible.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA";

function notify() {
  for (const fn of subs) fn();
}

function getAudio(): HTMLAudioElement {
  if (audioEl) return audioEl;
  const el = new Audio();
  el.preload = "none";
  el.addEventListener("ended", () => {
    if (swapDepth > 0) return;
    // CRITICAL: the silent-WAV activation buffer is only 1 sample long,
    // so it "ends" almost immediately after we kick off the cold path.
    // If we let that ended event clear playingSongId, the swap-to-real-
    // URL step that follows will refuse to play ("playingSongId !==
    // songId"). Detect this case and ignore.
    if (el.src === SILENT_WAV) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  el.addEventListener("error", () => {
    if (swapDepth > 0) return;
    // Same defense: errors from the silent WAV (e.g., bad data URI on
    // some browser) shouldn't be treated as "the user's track failed."
    if (el.src === SILENT_WAV) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  // Sync UI when iOS pauses our audio for an external reason — phone
  // call, another app taking the audio session, Control Center pause.
  // Guarded by swapDepth so our own pause-during-teardown doesn't
  // flicker the UI.
  el.addEventListener("pause", () => {
    if (swapDepth > 0) return;
    if (el.src === SILENT_WAV) return;
    // "ended" already handles the natural end-of-track. We only care
    // here about external pauses while the track is still mid-play.
    if (el.ended) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  audioEl = el;
  return el;
}

// Hard-reset the audio element before assigning a new source. On iOS
// Safari, a plain `audio.pause(); audio.src = newUrl; audio.load()`
// is not enough — the previous source's decoded buffer can keep
// playing through the output pipeline for several seconds while the
// new one loads. Removing the src attribute and calling load() forces
// the element into NETWORK_EMPTY / HAVE_NOTHING, which deterministically
// flushes that buffer.
function hardSwapSrc(audio: HTMLAudioElement, newUrl: string) {
  swapDepth++;
  try {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    audio.src = newUrl;
    audio.load();
  } finally {
    // The synchronous body above generates the pause/emptied/error
    // events we need to suppress. Release on the next microtask so any
    // event that's already queued behind the current task also sees
    // swapDepth > 0.
    queueMicrotask(() => {
      swapDepth--;
    });
  }
}

// Fetch preview URL + metadata, with cache + in-flight dedup. Metadata
// (title, artist, album, thumbnail) is used to populate the iOS Now
// Playing entry via navigator.mediaSession.
function fetchPreviewMeta(songId: string): Promise<PreviewMeta> {
  const cached = urlCache.get(songId);
  if (cached) return Promise.resolve(cached);
  const existing = inFlight.get(songId);
  if (existing) return existing;
  const p = fetch(`/api/preview-url?songId=${encodeURIComponent(songId)}`, {
    signal: AbortSignal.timeout(8000),
  })
    .then((r) =>
      r.ok
        ? r.json()
        : ({ previewUrl: null } as {
            previewUrl?: string | null;
            title?: string;
            artist?: string;
            album?: string | null;
            thumbnail?: string | null;
          }),
    )
    .then(
      (j: {
        previewUrl?: string | null;
        title?: string;
        artist?: string;
        album?: string | null;
        thumbnail?: string | null;
      }) => {
        const meta: PreviewMeta = {
          url: j.previewUrl ?? null,
          title: j.title,
          artist: j.artist,
          album: j.album ?? null,
          thumbnail: j.thumbnail ?? null,
        };
        urlCache.set(songId, meta);
        return meta;
      },
    )
    .catch(() => {
      const empty: PreviewMeta = { url: null };
      urlCache.set(songId, empty);
      return empty;
    })
    .finally(() => {
      inFlight.delete(songId);
    });
  inFlight.set(songId, p);
  return p;
}

// Combine two PreviewMeta records, preferring values from `overlay`
// when they're defined. Used to layer parent-supplied metadata on top
// of the API response (the parent has fresher info from its own DB
// query, e.g. the locally-stored artist string).
function mergeMeta(base: PreviewMeta, overlay: PreviewMeta): PreviewMeta {
  return {
    url: overlay.url ?? base.url,
    title: overlay.title ?? base.title,
    artist: overlay.artist ?? base.artist,
    album: overlay.album ?? base.album,
    thumbnail: overlay.thumbnail ?? base.thumbnail,
  };
}

// Populate the iOS Now Playing entry / Control Center widget. Without
// this, iOS shows a generic "Web Page Audio" entry that users confuse
// with the audio not playing at all.
function setMediaSession(meta: PreviewMeta) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  try {
    const MM = (window as unknown as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata;
    if (!MM) return;
    ms.metadata = new MM({
      title: meta.title ?? "Preview",
      artist: meta.artist ?? "",
      album: meta.album ?? "",
      artwork: meta.thumbnail
        ? [
            { src: meta.thumbnail, sizes: "300x300", type: "image/jpeg" },
            { src: meta.thumbnail, sizes: "512x512", type: "image/jpeg" },
          ]
        : [],
    });
    ms.setActionHandler?.("pause", () => {
      pauseCurrent();
    });
    ms.setActionHandler?.("play", () => {
      if (audioEl) {
        const p = audioEl.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    });
  } catch {
    // MediaSession isn't critical — fall through silently.
  }
}

// HOT PATH — must be called synchronously from a click handler.
// Sets src + calls play() inside the gesture. iOS happy.
function playUrlSync(songId: string, meta: PreviewMeta) {
  if (!meta.url) return;
  const audio = getAudio();
  if (audio.src !== meta.url) {
    hardSwapSrc(audio, meta.url);
  } else if (audio.ended) {
    audio.currentTime = 0;
  }
  playingSongId = songId;
  notify();
  setMediaSession(meta);
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      if (playingSongId === songId) {
        playingSongId = null;
        notify();
      }
    });
  }
}

// COLD PATH activation — must be called synchronously from a click handler.
// Plays a silent WAV to activate the audio element on iOS. Returns
// immediately; the silent buffer is inaudible.
function activateSync() {
  const audio = getAudio();
  hardSwapSrc(audio, SILENT_WAV);
  const p = audio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

// After the cold-path fetch completes, swap to the real URL and play.
// At this point the audio element is already user-activated (by the
// silent WAV play() that ran inside the click handler), so this
// play() call works on iOS even though we're outside the gesture.
function swapToMeta(songId: string, meta: PreviewMeta) {
  if (!meta.url) return;
  if (playingSongId !== songId) return; // user tapped a different song
  const audio = getAudio();
  hardSwapSrc(audio, meta.url);
  setMediaSession(meta);
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {
      if (playingSongId === songId) {
        playingSongId = null;
        notify();
      }
    });
  }
}

function pauseCurrent() {
  if (audioEl) audioEl.pause();
  if (playingSongId !== null) {
    playingSongId = null;
    notify();
  }
}

function subscribe(fn: () => void) {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}
function getSnapshot() {
  return playingSongId;
}
function getServerSnapshot(): string | null {
  return null;
}

// ──── Component ────────────────────────────────────────────────────

type Props = {
  songId: string;
  // Optional metadata. When provided we use it for MediaSession (iOS
  // Now Playing / Control Center) immediately on tap — no round-trip.
  title?: string;
  artist?: string;
  album?: string | null;
  thumbnail?: string | null;
  // OPTIONAL but heavily preferred: the resolved iTunes preview URL.
  // When the parent passes this from its own DB query (the canonical
  // path now — every feed/discover/album/saved query joins it in), the
  // button's click handler runs SYNCHRONOUSLY — no fetch, no silent
  // WAV gymnastics, just `audio.src = url; audio.play()`. That's the
  // pattern iOS Safari grants gesture activation for reliably. We only
  // fall back to the fetch path when this prop is undefined (legacy
  // call sites or songs not yet looked up).
  //
  // Tri-state:
  //   - undefined  → parent didn't pass it. Use legacy fetch path.
  //   - null       → parent looked up and confirmed no preview exists.
  //                  Hide the button.
  //   - string     → ready to play. Synchronous path.
  previewUrl?: string | null;
};

export function AudioPreviewButton({
  songId,
  title,
  artist,
  album,
  thumbnail,
  previewUrl,
}: Props) {
  const currentlyPlaying = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const isPlaying = currentlyPlaying === songId;
  // Initialize state from the module-level cache OR the prop. If the
  // parent told us there's no preview (previewUrl === null), we're
  // unavailable immediately.
  const [phase, setPhase] = useState<"idle" | "loading" | "unavailable">(() => {
    if (previewUrl === null) return "unavailable";
    const cached = urlCache.get(songId);
    return cached && cached.url === null ? "unavailable" : "idle";
  });

  // Seed the module cache from the prop so all buttons for this songId
  // share the same URL — and so the post-click play() goes straight
  // through the HOT PATH on first tap.
  useEffect(() => {
    if (previewUrl !== undefined && !urlCache.has(songId)) {
      urlCache.set(songId, {
        url: previewUrl,
        title,
        artist,
        album,
        thumbnail,
      });
    }
  }, [songId, previewUrl, title, artist, album, thumbnail]);

  // Prefetch URL on mount ONLY when the parent didn't provide one.
  // Most call sites now pass previewUrl, so this is a fallback for
  // older code paths.
  useEffect(() => {
    if (previewUrl !== undefined) return; // parent gave us the answer
    if (urlCache.has(songId)) return;
    const win = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
    };
    const fire = () => {
      fetchPreviewMeta(songId).then((meta) => {
        if (meta.url === null) setPhase("unavailable");
      });
    };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(fire, { timeout: 2000 });
    } else {
      setTimeout(fire, 200);
    }
  }, [songId, previewUrl]);

  // Last-chance warm on hover/touch — only relevant when parent didn't
  // pass the URL. Skip when previewUrl is already known.
  const warm = useCallback(() => {
    if (previewUrl !== undefined) return;
    if (!urlCache.has(songId)) void fetchPreviewMeta(songId);
  }, [songId, previewUrl]);

  const onClick = useCallback(() => {
    if (phase === "unavailable") return;
    if (isPlaying) {
      pauseCurrent();
      return;
    }
    const propsMeta: PreviewMeta = {
      url: previewUrl ?? null,
      title,
      artist,
      album,
      thumbnail,
    };

    // PRIMARY PATH — parent gave us the URL. Sync play, iOS gesture
    // preserved 100% of the time. No silent WAV gymnastics needed.
    if (typeof previewUrl === "string") {
      playUrlSync(songId, propsMeta);
      return;
    }

    // Legacy fall-throughs for call sites that haven't been updated to
    // pass previewUrl yet.
    const cached = urlCache.get(songId);
    if (cached && cached.url) {
      playUrlSync(songId, mergeMeta(cached, propsMeta));
      return;
    }
    if (cached && cached.url === null) {
      setPhase("unavailable");
      return;
    }
    // COLD PATH — neither the prop nor the cache has a URL yet.
    // Activate audio element synchronously (silent WAV), fetch + swap.
    activateSync();
    playingSongId = songId;
    notify();
    if (title || artist) setMediaSession(propsMeta);
    setPhase("loading");
    fetchPreviewMeta(songId).then((meta) => {
      setPhase("idle");
      if (!meta.url) {
        if (playingSongId === songId) {
          playingSongId = null;
          notify();
        }
        setPhase("unavailable");
        return;
      }
      swapToMeta(songId, mergeMeta(meta, propsMeta));
    });
  }, [isPlaying, phase, songId, title, artist, album, thumbnail, previewUrl]);

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
