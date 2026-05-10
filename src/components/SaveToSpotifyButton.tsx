"use client";
import { useEffect, useRef, useState } from "react";
import { SpotifyIcon } from "@/components/icons";

const ERROR_AUTO_RESET_MS = 2500;

// Adds a song to the viewer's Spotify "Liked Songs" library. Renders nothing
// when `connected` is false (settings page nudges users to connect first).
export function SaveToSpotifyButton({
  songId,
  connected,
}: {
  songId: string;
  connected: boolean;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel the pending auto-reset on unmount so we don't setState after.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  if (!connected) return null;

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
      const res = await fetch("/api/spotify/save-track", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        const errMap: Record<string, string> = {
          no_match_on_spotify: "Not on Spotify",
          spotify_not_linked: "Reconnect Spotify",
          not_linked: "Reconnect Spotify",
          token_expired: "Reconnect Spotify",
          missing_scope: "Reconnect Spotify",
          rate_limited: "Try again later",
        };
        setErrorMsg(errMap[j.error] || j.error || "Couldn't save");
        scheduleReset();
        return;
      }
      setState("saved");
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
          : "Save to Spotify";

  // Hint when the error suggests reconnecting — links straight to /settings.
  const showReconnect =
    state === "error" && /reconnect/i.test(errorMsg ?? "");

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={save}
        disabled={state === "saving" || state === "saved"}
        title={state === "saved" ? "Added to your Spotify library" : "Add to your Spotify library"}
        aria-label={state === "saved" ? "Saved to Spotify" : "Save to Spotify"}
        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-colors ${
          state === "saved"
            ? "border-emerald-600/60 bg-emerald-600/10 text-emerald-300"
            : state === "error"
              ? "border-red-600/60 bg-red-600/10 text-red-300"
              : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-emerald-500/60 hover:text-emerald-300"
        } disabled:opacity-70 active:scale-95`}
      >
        <span className={state === "saved" ? "text-emerald-400" : "text-emerald-500"}>
          <SpotifyIcon size={14} />
        </span>
        {label}
      </button>
      {showReconnect && (
        <a
          href="/settings"
          className="text-xs text-emerald-300 hover:text-emerald-200 underline"
        >
          settings →
        </a>
      )}
    </span>
  );
}
