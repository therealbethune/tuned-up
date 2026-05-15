"use client";
import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "./icons";

// Module-level audio coordinator: only one preview plays at a time.
// When a new one starts, any currently-playing instance pauses itself
// via this shared event bus.
//
// History note: we previously tried more elaborate coordinators —
// DOM-attached audio element, useSyncExternalStore, aggressive
// source teardown, synchronous-play prefetch — to chase iOS edge
// cases. Each rewrite broke the common case worse than the edge
// case it fixed. The simple shared-audio + event-bus pattern below
// is what actually works in production. If you're tempted to
// "improve" this, read the git log first — there are several
// monuments to that instinct.
const PREVIEW_EVENT = "tu:preview-active";

// Single shared <audio> element so iOS doesn't trip over multiple
// audio contexts. iOS Safari blocks autoplay; the first user gesture
// unlocks it.
let sharedAudio: HTMLAudioElement | null = null;
// Each "play session" gets a unique id. We can't identify the owning
// button by HTMLAudioElement reference because every button shares the
// same element — so we tag ownership with a number that's unique per
// click.
let nextOwnerId = 1;
let activeOwnerId: number | null = null;

function getSharedAudio(): HTMLAudioElement {
  if (typeof window === "undefined") {
    throw new Error("preview audio is browser-only");
  }
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "none";
  }
  return sharedAudio;
}

// 30-second song preview button. Lazy-fetches the iTunes previewUrl on
// first tap, plays via the module-shared audio element. Touch target
// 36×36 (within the row of action buttons) but enlarged to 44×44 via
// padding to satisfy WCAG.
export function AudioPreviewButton({ songId }: { songId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "unavailable">("idle");
  const previewUrlRef = useRef<string | null>(null);
  const ownerIdRef = useRef<number | null>(null);

  useEffect(() => {
    // If another preview button starts playing, ours should stop. We
    // compare session ids rather than audio-element identity because
    // every button shares the same <audio>.
    function onActive(e: Event) {
      const detail = (e as CustomEvent<{ ownerId: number }>).detail;
      if (ownerIdRef.current !== null && detail.ownerId !== ownerIdRef.current) {
        ownerIdRef.current = null;
        setState("idle");
      }
    }
    window.addEventListener(PREVIEW_EVENT, onActive);
    return () => window.removeEventListener(PREVIEW_EVENT, onActive);
  }, []);

  // Stop our playback when the component unmounts so previews don't
  // outlive the rating card scrolling out of view. Only pause if we're
  // still the active owner — otherwise we'd cut off another button
  // that took over the shared audio after us.
  useEffect(() => {
    return () => {
      if (ownerIdRef.current !== null && ownerIdRef.current === activeOwnerId) {
        activeOwnerId = null;
        if (sharedAudio && !sharedAudio.paused) sharedAudio.pause();
      }
    };
  }, []);

  async function toggle() {
    if (state === "loading" || state === "unavailable") return;
    const audio = getSharedAudio();
    if (state === "playing") {
      audio.pause();
      if (activeOwnerId === ownerIdRef.current) activeOwnerId = null;
      ownerIdRef.current = null;
      setState("idle");
      return;
    }
    setState("loading");
    try {
      let url = previewUrlRef.current;
      if (!url) {
        const res = await fetch(
          `/api/preview-url?songId=${encodeURIComponent(songId)}`,
        );
        const j = await res.json();
        url = j.previewUrl ?? null;
        previewUrlRef.current = url;
      }
      if (!url) {
        setState("unavailable");
        return;
      }
      // If the shared audio is currently a different track, switch
      // source. Always pause + load before reassigning src — on iOS
      // Safari, swapping audio.src mid-playback can leave the old
      // track audible while the new one buffers (which manifests as
      // "I tapped song B but I'm still hearing song A").
      if (audio.src !== url) {
        audio.pause();
        audio.src = url;
        audio.load();
      } else if (audio.ended) {
        // Same track that previously played to completion — rewind so
        // the next play() starts from the beginning instead of no-op.
        audio.currentTime = 0;
      }
      const myId = nextOwnerId++;
      ownerIdRef.current = myId;
      activeOwnerId = myId;
      // Notify other buttons that we're taking over.
      window.dispatchEvent(
        new CustomEvent(PREVIEW_EVENT, { detail: { ownerId: myId } }),
      );
      // Re-attach an "ended" handler each click — easier than tracking it.
      audio.onended = () => {
        if (activeOwnerId === myId) activeOwnerId = null;
        if (ownerIdRef.current === myId) {
          ownerIdRef.current = null;
          setState("idle");
        }
      };
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }

  if (state === "unavailable") return null;

  return (
    <button
      onClick={toggle}
      disabled={state === "loading"}
      aria-label={state === "playing" ? "Pause preview" : "Play 30-second preview"}
      title={state === "playing" ? "Pause" : "30-second preview"}
      className={`inline-flex items-center justify-center h-11 w-11 rounded-full transition-colors active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
        state === "playing"
          ? "bg-emerald-500 text-black"
          : "bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700"
      } disabled:opacity-60`}
    >
      {state === "loading" ? (
        <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-neutral-500 border-t-white animate-spin" />
      ) : state === "playing" ? (
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
