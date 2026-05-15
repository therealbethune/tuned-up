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
// Suppresses synthetic pause/error events that fire during our own
// src swap — otherwise the UI flickers idle between source A and B.
let swapping = false;

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
    if (swapping) return;
    // Same defense: errors from the silent WAV (e.g., bad data URI on
    // some browser) shouldn't be treated as "the user's track failed."
    if (el.src === SILENT_WAV) return;
    if (playingSongId !== null) {
      playingSongId = null;
      notify();
    }
  });
  audioEl = el;
  return el;
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
  swapping = true;
  if (audio.src !== meta.url) {
    audio.pause();
    audio.src = meta.url;
    audio.load();
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
  // Give synthetic pause/error events from the src swap a tick to settle.
  setTimeout(() => {
    swapping = false;
  }, 50);
}

// COLD PATH activation — must be called synchronously from a click handler.
// Plays a silent WAV to activate the audio element on iOS. Returns
// immediately; the silent buffer is inaudible.
function activateSync() {
  const audio = getAudio();
  swapping = true;
  audio.pause();
  audio.src = SILENT_WAV;
  audio.load();
  const p = audio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
  setTimeout(() => {
    swapping = false;
  }, 50);
}

// After the cold-path fetch completes, swap to the real URL and play.
// At this point the audio element is already user-activated (by the
// silent WAV play() that ran inside the click handler), so this
// play() call works on iOS even though we're outside the gesture.
function swapToMeta(songId: string, meta: PreviewMeta) {
  if (!meta.url) return;
  if (playingSongId !== songId) return; // user tapped a different song
  const audio = getAudio();
  swapping = true;
  audio.pause();
  audio.src = meta.url;
  audio.load();
  if (audio.ended) audio.currentTime = 0;
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
  setTimeout(() => {
    swapping = false;
  }, 50);
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
  // Optional metadata. When passed, used to populate navigator.mediaSession
  // immediately on tap — so iOS Now Playing / Control Center shows the
  // correct song without waiting for an API round-trip. All six call sites
  // already have these fields from the parent's DB query, so passing them
  // is essentially free.
  title?: string;
  artist?: string;
  album?: string | null;
  thumbnail?: string | null;
};

export function AudioPreviewButton({
  songId,
  title,
  artist,
  album,
  thumbnail,
}: Props) {
  const currentlyPlaying = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const isPlaying = currentlyPlaying === songId;
  // Initialize state from the module-level cache so we don't need a
  // synchronous setState inside useEffect for the "already known to be
  // unavailable" case (which trips react-hooks/set-state-in-effect).
  const [phase, setPhase] = useState<"idle" | "loading" | "unavailable">(() => {
    const cached = urlCache.get(songId);
    return cached && cached.url === null ? "unavailable" : "idle";
  });

  // Prefetch URL on mount (low priority). If already cached we skip;
  // if known unavailable we already initialized phase above.
  useEffect(() => {
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
  }, [songId]);

  // Last-chance warm on hover/touch — fires distinct gesture from click.
  const warm = useCallback(() => {
    if (!urlCache.has(songId)) void fetchPreviewMeta(songId);
  }, [songId]);

  const onClick = useCallback(() => {
    if (phase === "unavailable") return;
    if (isPlaying) {
      pauseCurrent();
      return;
    }
    // Build a PreviewMeta from the parent props. Used as the FIRST source
    // of truth for MediaSession — if we also get fresher data back from
    // the /api/preview-url response, that updates on top. The immediate
    // tap response already shows the right song on iOS Now Playing.
    const propsMeta: PreviewMeta = { url: null, title, artist, album, thumbnail };
    const cached = urlCache.get(songId);
    if (cached && cached.url) {
      // HOT PATH — URL cached. Sync play, iOS gesture preserved.
      // Merge parent props on top of cache so MediaSession always has
      // the freshest title/artist (parent's DB row beats API response).
      playUrlSync(songId, mergeMeta(cached, propsMeta));
      return;
    }
    if (cached && cached.url === null) {
      setPhase("unavailable");
      return;
    }
    // COLD PATH — URL not cached. Activate audio element synchronously
    // (silent WAV), populate MediaSession from parent props NOW so the
    // user sees the right track in Control Center while the URL is
    // fetched, then fetch + swap to the real audio URL.
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
  }, [isPlaying, phase, songId, title, artist, album, thumbnail]);

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
