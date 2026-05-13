"use client";
import { useState } from "react";
import { LikersSheet } from "@/components/LikersSheet";
import { toast } from "@/lib/toast";

// Heart toggles the viewer's own like; the count next to it opens the
// "Liked by" sheet so anyone can see who's tapped 💗. Split into two
// adjacent buttons so each action has a clear hit-target and aria-label.
export function LikeButton({
  ratingUserId,
  songId,
  initialLiked,
  initialCount,
}: {
  ratingUserId: string;
  songId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Pop animation token: bumped on each fresh-like (not unlike) to
  // re-trigger the keyframe. Used as a key on the heart svg so React
  // remounts the element and the CSS animation plays from frame 0.
  const [popKey, setPopKey] = useState(0);

  async function toggle() {
    if (busy) return;
    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    // Only celebrate the like, not the unlike — popping on remove
    // would feel like the heart cheering being taken away.
    if (!prevLiked) setPopKey((k) => k + 1);
    setBusy(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratingUserId, songId }),
      });
      if (!res.ok) {
        // Surface rate-limit + other errors so the user understands
        // why the heart flickered. fromResponse handles 429 / 403 / etc.
        await toast.fromResponse(res, "Couldn't update like");
        throw new Error("toggle failed");
      }
      const j = await res.json();
      setLiked(j.liked);
      setCount(j.count);
    } catch {
      // Roll back
      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex items-center -ml-1.5 -my-1">
      <button
        onClick={toggle}
        disabled={busy}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
        title={liked ? "Unlike" : "Like"}
        className={`inline-flex items-center text-sm transition-all px-1.5 py-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
          liked
            ? "text-rose-400 hover:text-rose-300"
            : "text-neutral-400 hover:text-white"
        } active:scale-95 disabled:opacity-50`}
      >
        <svg
          key={popKey}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className={`transition-transform ${liked ? "scale-110" : ""} ${
            popKey > 0 && liked ? "heart-pop" : ""
          }`}
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      <button
        onClick={() => count > 0 && setSheetOpen(true)}
        disabled={count === 0}
        aria-label={count > 0 ? `See who liked — ${count}` : "No likes yet"}
        title={count > 0 ? "See who liked this" : undefined}
        className={`text-sm tabular-nums pl-1 pr-1.5 py-1 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
          count > 0
            ? liked
              ? "text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
              : "text-neutral-400 hover:text-white hover:underline cursor-pointer"
            : "text-neutral-500 cursor-default"
        }`}
      >
        {count}
      </button>

      <LikersSheet
        open={sheetOpen}
        ratingUserId={ratingUserId}
        songId={songId}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
