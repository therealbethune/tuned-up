"use client";
import { useState } from "react";

// Tiny Spotify glyph — same vibe as the icon in StreamingLinks.
function SpotifyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path
        d="M7.5 14.4c2.4-1.4 5.7-1.7 9-.8m-9-3.6c2.9-1.6 7-2 10.5-.8m-10.5-3c3.4-1.6 8.5-1.8 12.5-.4"
        stroke="white"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

  if (!connected) return null;

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
        // Auto-reset so they can retry.
        setTimeout(() => setState("idle"), 2500);
        return;
      }
      setState("saved");
    } catch {
      setState("error");
      setErrorMsg("Network error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const label =
    state === "saving"
      ? "…"
      : state === "saved"
        ? "Saved ✓"
        : state === "error"
          ? errorMsg ?? "Error"
          : "Save to Spotify";

  return (
    <button
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      title={state === "saved" ? "Added to your Spotify library" : "Add to your Spotify library"}
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
  );
}
