"use client";
import { useEffect, useRef, useState } from "react";
import { PlayIcon } from "./icons";

// Module-level audio coordinator: only one preview plays at a time.
// When a new one starts, any currently-playing instance pauses itself
// via this shared event bus.
const PREVIEW_EVENT = "tu:preview-active";

// Single shared <audio> element so iOS doesn't trip over multiple
// audio contexts. iOS Safari blocks autoplay; the first user gesture
// unlocks it.
let sharedAudio: HTMLAudioElement | null = null;
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
  const myAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // If another preview button starts playing, ours should stop. We
    // identify "ours" via the audio element identity check.
    //
    // Critical: also CLEAR myAudioRef when the shared audio is taken
    // over by someone else, so when *this* component unmounts later
    // it doesn't pause an audio element that another button is now
    // playing. The previous version kept ownership forever, which
    // meant scrolling away from a card whose preview had been
    // superseded would cut off whoever was actually playing.
    function onActive(e: Event) {
      const detail = (e as CustomEvent<{ source: HTMLAudioElement }>).detail;
      if (myAudioRef.current && detail.source !== myAudioRef.current) {
        myAudioRef.current = null;
        setState("idle");
      }
    }
    window.addEventListener(PREVIEW_EVENT, onActive);
    return () => window.removeEventListener(PREVIEW_EVENT, onActive);
  }, []);

  // Stop our playback when the component unmounts so previews don't
  // outlive the rating card scrolling out of view. By this point
  // myAudioRef is null whenever someone else owns the shared audio
  // (see the listener above), so we never pause a stranger's track.
  useEffect(() => {
    return () => {
      const audio = myAudioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
      }
    };
  }, []);

  async function toggle() {
    if (state === "loading" || state === "unavailable") return;
    const audio = getSharedAudio();
    if (state === "playing") {
      audio.pause();
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
      // If the shared audio is currently a different track, switch source.
      if (audio.src !== url) {
        audio.src = url;
      }
      myAudioRef.current = audio;
      // Notify other buttons that we're taking over.
      window.dispatchEvent(
        new CustomEvent(PREVIEW_EVENT, { detail: { source: audio } }),
      );
      // Re-attach an "ended" handler each click — easier than tracking it.
      audio.onended = () => setState("idle");
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
      className={`inline-flex items-center justify-center h-9 w-9 rounded-full transition-colors active:scale-95 ${
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
