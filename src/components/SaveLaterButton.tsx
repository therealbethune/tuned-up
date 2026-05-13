"use client";
import { useState } from "react";
import { toast } from "@/lib/toast";

// Bookmark a song to come back and rate later. Replaces the (removed)
// Spotify save-to-library button with something that lives entirely
// inside Tuned Up. Two-state pill: outline when unsaved, filled when
// saved. The /api/ratings POST clears the save automatically on rate,
// so users don't have to babysit two states.
export function SaveLaterButton({
  songId,
  initialSaved = false,
  song,
}: {
  songId: string;
  initialSaved?: boolean;
  /** Optional song payload — passed to /api/saved so the songs row
   *  upserts when the user saves a catalog song they haven't rated
   *  yet (the songs table is otherwise populated by /api/ratings). */
  song?: {
    id: string;
    kind: "song" | "album";
    title: string;
    artist: string;
    album: string | null;
    thumbnail: string | null;
    durationSeconds: number | null;
  };
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const prev = saved;
    setSaved(!prev);
    setBusy(true);
    try {
      const res = await fetch("/api/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId, song }),
      });
      if (!res.ok) {
        setSaved(prev);
        await toast.fromResponse(res, "Couldn't save");
        return;
      }
      const j = await res.json();
      setSaved(Boolean(j.saved));
      toast.success(j.saved ? "Saved for later." : "Removed from saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save for later"}
      title={saved ? "Saved — tap to remove" : "Save for later"}
      className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 min-h-8 rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
        saved
          ? "border-amber-500/60 bg-amber-500/10 text-amber-200"
          : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-amber-500/50 hover:text-amber-200"
      } disabled:opacity-60 active:scale-95`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M6 4h12v17l-6-4-6 4z" />
      </svg>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
