"use client";
import { useEffect, useRef, useState } from "react";
import { AppleMusicIcon } from "@/components/icons";
import type { MusicKitInstance } from "@/lib/musickit-types";
import "@/lib/musickit-types";

const ERROR_AUTO_RESET_MS = 2500;
const MUSICKIT_JS_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

// One-time loader for MusicKit JS + token fetch + configure. Returns the
// configured instance. Subsequent calls reuse the same instance.
let setupPromise: Promise<MusicKitInstance> | null = null;
async function setupMusicKit(): Promise<MusicKitInstance> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    // Inject script if needed.
    if (!window.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${MUSICKIT_JS_URL}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("musickit load failed")), { once: true });
          return;
        }
        const s = document.createElement("script");
        s.src = MUSICKIT_JS_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("musickit load failed"));
        document.head.appendChild(s);
      });
      // MusicKit fires its own "musickitloaded" event after init. We can
      // safely wait one tick after the script-load fires.
      await new Promise<void>((resolve) => {
        if (window.MusicKit) return resolve();
        document.addEventListener("musickitloaded", () => resolve(), { once: true });
      });
    }
    if (!window.MusicKit) throw new Error("MusicKit global missing");
    // Fetch our developer token.
    const tokRes = await fetch("/api/musickit/token", { cache: "no-store" });
    if (!tokRes.ok) {
      const j = await tokRes.json().catch(() => ({}));
      throw new Error(j.error || `developer token ${tokRes.status}`);
    }
    const { token } = await tokRes.json();
    await window.MusicKit.configure({
      developerToken: token,
      app: { name: "Tuned Up", build: "1.0" },
    });
    return window.MusicKit.getInstance();
  })();
  return setupPromise;
}

// Adds a song to the viewer's Apple Music library. Lazy-loads MusicKit JS
// on first click; user authorizes Apple Music in a popup; we look up the
// Apple Music catalog ID server-side then call addToLibrary.
export function SaveToAppleMusicButton({ songId }: { songId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  function scheduleReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setState("idle");
      resetTimerRef.current = null;
    }, ERROR_AUTO_RESET_MS);
  }

  async function save() {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    setErrorMsg(null);
    try {
      // 1. Server: resolve the song to an Apple Music catalog ID.
      const resolveRes = await fetch(
        `/api/applemusic/resolve?songId=${encodeURIComponent(songId)}`,
      );
      const resolveJ = await resolveRes.json().catch(() => ({}));
      if (!resolveRes.ok) {
        setState("error");
        setErrorMsg(resolveJ.error === "no_match" ? "Not on Apple Music" : "Couldn't find song");
        scheduleReset();
        return;
      }
      const trackId: string = resolveJ.trackId;

      // 2. Client: ensure MusicKit JS is loaded + configured.
      let music: MusicKitInstance;
      try {
        music = await setupMusicKit();
      } catch (e) {
        setState("error");
        setErrorMsg((e as Error).message.includes("token") ? "Token error" : "MusicKit load failed");
        scheduleReset();
        return;
      }

      // 3. Authorize user with Apple Music (no-op if already authorized).
      if (!music.isAuthorized) {
        try {
          await music.authorize();
        } catch {
          setState("error");
          setErrorMsg("Sign-in cancelled");
          scheduleReset();
          return;
        }
      }

      // 4. Add to library via MusicKit API.
      try {
        await music.api.music(
          "v1/me/library",
          undefined,
          {
            fetchOptions: {
              method: "POST",
              body: JSON.stringify({ ids: { songs: [trackId] } }),
            },
          },
        );
        setState("saved");
      } catch (e) {
        const msg = (e as Error).message || "Save failed";
        setState("error");
        setErrorMsg(/subscript|premium/i.test(msg) ? "Apple Music subscription required" : "Couldn't save");
        scheduleReset();
      }
    } catch {
      setState("error");
      setErrorMsg("Network error");
      scheduleReset();
    }
  }

  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved ✓"
        : state === "error"
          ? errorMsg ?? "Couldn't save"
          : "Save to Apple Music";

  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      title={state === "saved" ? "Added to your Apple Music library" : "Add to your Apple Music library"}
      aria-label={state === "saved" ? "Saved to Apple Music" : "Save to Apple Music"}
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
        state === "saved"
          ? "border-pink-500/60 bg-pink-500/10 text-pink-300"
          : state === "error"
            ? "border-red-600/60 bg-red-600/10 text-red-300"
            : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-pink-500/60 hover:text-pink-300"
      } disabled:opacity-70 active:scale-95`}
    >
      <span className={state === "saved" ? "text-pink-400" : "text-pink-500"}>
        <AppleMusicIcon size={14} />
      </span>
      {label}
    </button>
  );
}
