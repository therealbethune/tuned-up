"use client";
import { useState } from "react";

// Connect / disconnect a Spotify account. Designed to live on /settings.
// `connected` and `spotifyUserId` are passed in by the server so the first
// paint already shows the right state (no client-side fetch required).
export function SpotifyAccountCard({
  connected,
  spotifyUserId,
}: {
  connected: boolean;
  spotifyUserId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [localConnected, setLocalConnected] = useState(connected);

  async function disconnect() {
    if (!confirm("Disconnect Spotify? You'll need to reconnect to save songs.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/spotify/account", { method: "DELETE" });
      if (res.ok) setLocalConnected(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-400 inline-flex items-center justify-center shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
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
          <h3 className="text-sm font-semibold">Spotify</h3>
          {localConnected ? (
            <>
              <p className="text-xs text-neutral-400 mt-0.5">
                Connected{spotifyUserId ? ` as ${spotifyUserId}` : ""}. You can save rated songs straight to your Liked Songs.
              </p>
              <button
                onClick={disconnect}
                disabled={busy}
                className="mt-2 text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {busy ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-neutral-400 mt-0.5">
                Link your Spotify so you can save rated songs to your Liked Songs library and import your top tracks.
              </p>
              <a
                href="/api/spotify/connect?return=/settings"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform"
              >
                Connect Spotify
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
