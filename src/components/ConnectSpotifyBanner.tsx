"use client";
import { useState } from "react";

const DISMISS_KEY = "tu_spotify_banner_dismissed";

// Top-of-feed nudge to link Spotify. Dismissible — once X'd, stays away
// (localStorage flag) until the user clears it from /settings.
export function ConnectSpotifyBanner({ connected }: { connected: boolean }) {
  // Initialise from localStorage on first render. SSR-safe via lazy-init.
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  if (connected || hidden) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setHidden(true);
  }

  return (
    <div className="rounded-lg border border-emerald-700/40 bg-gradient-to-br from-emerald-700/20 to-emerald-900/10 p-4 flex items-center gap-3">
      <div className="h-11 w-11 rounded-full bg-emerald-500 text-black inline-flex items-center justify-center shrink-0">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <path
            d="M7.5 14.4c2.4-1.4 5.7-1.7 9-.8m-9-3.6c2.9-1.6 7-2 10.5-.8m-10.5-3c3.4-1.6 8.5-1.8 12.5-.4"
            stroke="#000"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">Connect Spotify</p>
        <p className="text-xs text-neutral-300 mt-0.5">
          Save songs you rate straight to your Liked Songs library.
        </p>
      </div>
      <a
        href="/api/spotify/connect?return=/feed"
        className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform shrink-0"
      >
        Connect
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-neutral-500 hover:text-white text-lg shrink-0 -mr-1"
      >
        ×
      </button>
    </div>
  );
}
