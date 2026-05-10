"use client";
import { useEffect, useState } from "react";
import { AppleMusicIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { MusicKitInstance } from "@/lib/musickit-types";
import "@/lib/musickit-types";

const APPLE_AUTHORIZED_KEY = "tu_apple_music_authorized";
const MUSICKIT_JS_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

// Shared with ConnectMusicBanner + SaveToAppleMusicButton — each loads its
// own promise but the script + token requests are de-duped by the browser.
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

// Connect / disconnect Apple Music. Lives on /settings alongside the
// Spotify card. MusicKit JS owns the user-token state in-browser, so the
// "connected" indicator is a localStorage flag we set on successful
// authorize and clear on disconnect.
export function AppleMusicAccountCard() {
  // null while we check localStorage (avoids SSR hydration mismatch by
  // rendering a neutral state on first paint).
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    try {
      setConnected(window.localStorage.getItem(APPLE_AUTHORIZED_KEY) === "1");
    } catch {
      setConnected(false);
    }
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
      try {
        window.localStorage.setItem(APPLE_AUTHORIZED_KEY, "1");
      } catch {}
      setConnected(true);
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg === "token"
          ? "Developer token error"
          : msg === "load"
            ? "MusicKit failed to load"
            : "Sign-in cancelled",
      );
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
      try {
        window.localStorage.removeItem(APPLE_AUTHORIZED_KEY);
      } catch {}
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
          {connected === null ? (
            <p className="text-xs text-neutral-400 mt-0.5">Checking…</p>
          ) : connected ? (
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
