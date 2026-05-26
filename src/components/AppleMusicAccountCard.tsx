"use client";
import { useEffect, useState } from "react";
import { AppleMusicIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  setupMusicKit,
  markAppleMusicAuthorized,
  isAppleMusicAuthorized,
  musicKitErrorMessage,
} from "@/lib/musickit-client";
import type { MusicKitInstance } from "@/lib/musickit-types";

// Connect / disconnect Apple Music. Lives on /settings alongside the
// Spotify card. MusicKit JS owns the user-token state in-browser, so the
// "connected" indicator is a localStorage flag we set on successful
// authorize and clear on disconnect.
export function AppleMusicAccountCard() {
  // null while we check localStorage (avoids SSR hydration mismatch by
  // rendering a neutral state on first paint).
  // Start with `false` (the safer default) instead of `null` so the card
  // renders its full "Connect Apple Music" CTA on first paint instead of
  // a momentary "Checking…" flash. On mount we read localStorage and flip
  // to `true` if the flag is set — at worst the connect CTA shows for one
  // frame on a connected user, which is invisible.
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // localStorage isn't available during SSR, so we can't read the
  // "authorized" flag from useState's initializer without a hydration
  // mismatch. The setState-on-mount pattern is the correct hydration-
  // safe approach here; the lint rule misclassifies it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isAppleMusicAuthorized()) setConnected(true);
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const music = await setupMusicKit();
      if (!music.isAuthorized) {
        await music.authorize();
      }
      markAppleMusicAuthorized(true);
      setConnected(true);
    } catch (e) {
      setError(musicKitErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      // MusicKit JS exposes unauthorize() to clear its in-browser token.
      // It might not exist if MusicKit never finished loading — guard.
      const music = window.MusicKit?.getInstance?.() as MusicKitInstance & {
        unauthorize?: () => Promise<void>;
      };
      try {
        await music?.unauthorize?.();
      } catch {
        /* ignore */
      }
      markAppleMusicAuthorized(false);
      setConnected(false);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-pink-500/15 text-pink-400 inline-flex items-center justify-center shrink-0">
          <AppleMusicIcon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Apple Music</h3>
          {connected ? (
            <>
              <p className="text-xs text-neutral-400 mt-0.5">
                Connected. You can save rated songs straight to your Apple Music library.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-400 mt-0.5">
                Link your Apple Music so you can save rated songs to your library. Requires an active Apple Music subscription.
              </p>
              <button
                onClick={connect}
                disabled={busy}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pink-500 hover:bg-pink-400 text-white text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform disabled:opacity-60"
              >
                <AppleMusicIcon size={14} />
                {busy ? "Connecting…" : "Connect Apple Music"}
              </button>
              {error && (
                <p className="mt-2 text-xs text-red-400">{error}</p>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={disconnect}
        title="Disconnect Apple Music?"
        body="You can reconnect anytime. Songs already in your library stay there."
        confirmLabel="Disconnect"
        destructive
        busy={busy}
      />
    </div>
  );
}
