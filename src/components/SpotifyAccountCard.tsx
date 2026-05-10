"use client";
import { useState } from "react";
import { SpotifyIconOnGreen } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";

// Connect / disconnect a Spotify account. Designed to live on /settings.
// `connected` and `spotifyUserId` are passed in by the server so the first
// paint already shows the right state (no client-side fetch required).
// `missingScopes` lists any scopes we now require but the stored token
// doesn't have — pre-existing connections from before we added new
// scopes will be in this state and need a one-tap re-link.
export function SpotifyAccountCard({
  connected,
  spotifyUserId,
  missingScopes = [],
}: {
  connected: boolean;
  spotifyUserId: string | null;
  missingScopes?: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [localConnected, setLocalConnected] = useState(connected);
  const [confirming, setConfirming] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/spotify/account", { method: "DELETE" });
      if (res.ok) setLocalConnected(false);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-400 inline-flex items-center justify-center shrink-0">
          <SpotifyIconOnGreen size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">Spotify</h3>
          {localConnected ? (
            <>
              <p className="text-xs text-neutral-400 mt-0.5">
                Connected{spotifyUserId ? ` as ${spotifyUserId}` : ""}. You can save rated songs straight to your Liked Songs.
              </p>
              {missingScopes.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-200 px-2 py-1.5 space-y-1.5">
                  <p className="text-[11px]">
                    New permissions are available
                    {missingScopes.includes("user-read-currently-playing") && " (Now Playing)"}
                    . Re-link to enable.
                  </p>
                  <a
                    href="/api/spotify/connect?return=/settings"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-semibold px-2.5 py-1 active:scale-95"
                  >
                    Refresh permissions
                  </a>
                </div>
              )}
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                >
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
                <a
                  href="/api/spotify/diagnose"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-neutral-500 hover:text-neutral-300"
                  title="JSON diagnostic of your Spotify connection"
                >
                  Diagnose
                </a>
              </div>
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
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={disconnect}
        title="Disconnect Spotify?"
        body="You'll need to reconnect to save songs to your Liked Songs."
        confirmLabel="Disconnect"
        destructive
        busy={busy}
      />
    </div>
  );
}
