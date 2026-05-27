"use client";
import { useEffect, useState } from "react";
import { AppleMusicIcon } from "@/components/icons";
import {
  setupMusicKit,
  musicKitErrorMessage,
} from "@/lib/musickit-client";
import { toast } from "@/lib/toast";

// Settings card: lets the user connect their Apple Music account so
// Tuned Up can pull their recent-played history server-side and
// surface it on their profile + (eventually) the Discover network rail.
//
// Different from <AppleMusicAccountCard /> which is about the
// save-to-library flow. Conceptually they could merge (same MusicKit
// auth handles both) but they're presented as two separate opt-ins
// in Settings so the user can adopt one without the other. The same
// MusicKit grant under the hood covers both — re-auth here will also
// satisfy a future save-to-library call without prompting again.
type ConnectionStatus = {
  connected: boolean;
  visibility: "followers" | "public" | "private";
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

type Props = {
  initial: ConnectionStatus;
};

export function AppleMusicListeningCard({ initial }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clear any stale error after 5s so a transient connect failure
  // doesn't visually stick after the user retries successfully.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const music = await setupMusicKit();
      if (!music.isAuthorized) {
        await music.authorize();
      }
      const token = music.musicUserToken;
      if (!token) {
        throw new Error("no_token");
      }
      const res = await fetch("/api/applemusic/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          musicUserToken: token,
          storefront: music.storefrontId ?? null,
          visibility: status.visibility,
        }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't link your Apple Music");
        return;
      }
      setStatus({
        ...status,
        connected: true,
        lastSyncedAt: new Date().toISOString(),
        lastSyncError: null,
      });
      toast.success("Connected. Your recent listens will sync shortly.");
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === "no_token" ? "Apple Music sign-in didn't return a token. Try again." : musicKitErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/applemusic/disconnect", { method: "POST" });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't disconnect");
        return;
      }
      setStatus({ ...status, connected: false, lastSyncedAt: null, lastSyncError: null });
      toast.success("Disconnected. Your listening history was cleared.");
    } finally {
      setBusy(false);
    }
  }

  async function setVisibility(next: ConnectionStatus["visibility"]) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/applemusic/connect", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't update visibility");
        return;
      }
      setStatus({ ...status, visibility: next });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card-elevated p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gradient-sunset text-black shadow-lg">
          <AppleMusicIcon size={22} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="headline-md">Apple Music listening</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            Pull your recent listens so friends can see what you&apos;ve been playing.
          </p>
        </div>
        {status.connected ? (
          <span className="label-eyebrow text-emerald-300 shrink-0 pt-1.5">
            Connected
          </span>
        ) : null}
      </div>

      {error && (
        <div className="text-sm rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2">
          {error}
        </div>
      )}

      {status.connected ? (
        <>
          {/* Visibility selector — 3 pills, current state highlighted.
              Mirrors the existing privacy/follower model so it feels
              like the same control surface, not a new concept. */}
          <fieldset className="space-y-2">
            <legend className="label-eyebrow">Who can see it</legend>
            <div className="flex flex-wrap gap-2">
              {([
                { key: "followers", label: "Followers", hint: "People you follow back" },
                { key: "public", label: "Anyone", hint: "Public link visitors too" },
                { key: "private", label: "Only me", hint: "Pause sharing without disconnecting" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setVisibility(opt.key)}
                  disabled={busy || status.visibility === opt.key}
                  className={`text-xs font-medium rounded-full px-3.5 py-1.5 min-h-9 border transition-all ${
                    status.visibility === opt.key
                      ? "bg-emerald-500 text-black border-emerald-500"
                      : "border-neutral-700 text-neutral-200 hover:border-neutral-500"
                  } disabled:opacity-70`}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
            <span className="text-xs text-neutral-500">
              {status.lastSyncError ? (
                <span className="text-amber-300">
                  Last sync hit a snag — tap Reconnect to refresh.
                </span>
              ) : status.lastSyncedAt ? (
                <>Last synced {formatRelative(status.lastSyncedAt)}</>
              ) : (
                <>Syncing your listens now…</>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={connect}
                disabled={busy}
                className="text-xs font-medium rounded-full px-3.5 py-1.5 min-h-9 border border-neutral-700 hover:border-neutral-500 disabled:opacity-70"
              >
                {busy ? "…" : "Reconnect"}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy}
                className="text-xs font-medium rounded-full px-3.5 py-1.5 min-h-9 border border-red-500/40 text-red-300 hover:bg-red-500/10 disabled:opacity-70"
              >
                Disconnect
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <span className="text-xs text-neutral-500">
            Requires an Apple Music subscription. We never store credentials, just a session token.
          </span>
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="text-sm font-semibold rounded-full px-4 py-2 min-h-9 gradient-sunset text-black shadow-lg disabled:opacity-70"
          >
            {busy ? "Connecting…" : "Connect Apple Music"}
          </button>
        </div>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "just now";
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
