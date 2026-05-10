"use client";
import { useState } from "react";
import { SpotifyIconOnGreen, AppleMusicIcon } from "@/components/icons";
import type { MusicKitInstance } from "@/lib/musickit-types";
import "@/lib/musickit-types";

const DISMISS_KEY = "tu_music_banner_dismissed";
const APPLE_AUTHORIZED_KEY = "tu_apple_music_authorized";

const MUSICKIT_JS_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

// Reusable MusicKit setup — shared with SaveToAppleMusicButton via separate
// loads (each component caches its own promise). Cheap to dupe.
async function setupMusicKit(): Promise<MusicKitInstance> {
  if (!window.MusicKit) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(`script[src="${MUSICKIT_JS_URL}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("load")), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = MUSICKIT_JS_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("load"));
      document.head.appendChild(s);
    });
    await new Promise<void>((resolve) => {
      if (window.MusicKit) return resolve();
      document.addEventListener("musickitloaded", () => resolve(), { once: true });
    });
  }
  if (!window.MusicKit) throw new Error("MusicKit global missing");
  const tokRes = await fetch("/api/musickit/token", { cache: "no-store" });
  if (!tokRes.ok) throw new Error("token");
  const { token } = await tokRes.json();
  await window.MusicKit.configure({
    developerToken: token,
    app: { name: "Tuned Up", build: "1.0" },
  });
  return window.MusicKit.getInstance();
}

// Banner that nudges the viewer to connect a music service so they can
// save songs as they rate them. Shows when both Spotify is unconnected
// AND the user hasn't dismissed. Renders nothing once at least one
// service is connected.
export function ConnectMusicBanner({
  spotifyConnected,
}: {
  spotifyConnected: boolean;
}) {
  // Dismiss state and Apple authorization state both live in localStorage
  // (Apple Music auth lives in MusicKit JS's own cookies, but a quick
  // localStorage flag tells US whether the user has ever completed the
  // flow — good enough for hiding the banner).
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });
  const [appleConnected, setAppleConnected] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(APPLE_AUTHORIZED_KEY) === "1";
  });
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  // Hide once any service is connected OR explicitly dismissed.
  if (hidden || spotifyConnected || appleConnected) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setHidden(true);
  }

  async function connectApple() {
    if (appleBusy) return;
    setAppleBusy(true);
    setAppleError(null);
    try {
      const music = await setupMusicKit();
      if (!music.isAuthorized) {
        await music.authorize();
      }
      try {
        window.localStorage.setItem(APPLE_AUTHORIZED_KEY, "1");
      } catch {}
      setAppleConnected(true);
    } catch (e) {
      const msg = (e as Error).message;
      setAppleError(
        msg === "token"
          ? "Token error"
          : msg === "load"
            ? "MusicKit failed to load"
            : "Sign-in cancelled",
      );
    } finally {
      setAppleBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-emerald-700/40 bg-gradient-to-br from-emerald-700/15 to-pink-700/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Connect your music</p>
          <p className="text-xs text-neutral-300 mt-0.5">
            Save songs you rate straight to your Spotify or Apple Music library.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-neutral-400 hover:text-white px-2 py-1 -my-1 rounded-md border border-transparent hover:border-neutral-700 shrink-0"
        >
          Dismiss
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href="/api/spotify/connect?return=/feed"
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform"
        >
          <SpotifyIconOnGreen size={14} />
          Connect Spotify
        </a>
        <button
          onClick={connectApple}
          disabled={appleBusy}
          className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 hover:bg-pink-400 text-white text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform disabled:opacity-60"
        >
          <AppleMusicIcon size={14} />
          {appleBusy ? "Connecting…" : "Connect Apple Music"}
        </button>
        {appleError && (
          <span className="text-xs text-red-400">{appleError}</span>
        )}
      </div>
    </div>
  );
}
