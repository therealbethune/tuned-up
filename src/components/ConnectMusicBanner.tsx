"use client";
import { useState } from "react";
import { AppleMusicIcon } from "@/components/icons";
import {
  setupMusicKit,
  markAppleMusicAuthorized,
  isAppleMusicAuthorized,
  musicKitErrorMessage,
} from "@/lib/musickit-client";

const DISMISS_KEY = "tu_music_banner_dismissed";

// Nudge the viewer to connect Apple Music so they can save songs as
// they rate them. Hides once connected OR dismissed.
export function ConnectMusicBanner() {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });
  const [appleConnected, setAppleConnected] = useState(() =>
    isAppleMusicAuthorized(),
  );
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);

  if (hidden || appleConnected) return null;

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
      markAppleMusicAuthorized(true);
      setAppleConnected(true);
    } catch (e) {
      setAppleError(musicKitErrorMessage(e));
    } finally {
      setAppleBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-pink-700/40 bg-gradient-to-br from-pink-700/15 to-fuchsia-700/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Connect Apple Music</p>
          <p className="text-xs text-neutral-300 mt-0.5">
            Save songs you rate straight to your Apple Music library.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="text-xs text-neutral-400 hover:text-white px-2 py-1 -my-1 rounded-md border border-transparent hover:border-neutral-700 shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          Dismiss
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={connectApple}
          disabled={appleBusy}
          className="inline-flex items-center gap-1.5 rounded-full bg-pink-500 hover:bg-pink-400 text-white text-xs font-semibold px-3 py-1.5 min-h-9 active:scale-95 transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
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
