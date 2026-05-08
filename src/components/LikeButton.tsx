"use client";
import { useState } from "react";

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

  async function toggle() {
    if (busy) return;
    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!prevLiked);
    setCount(prevCount + (prevLiked ? -1 : 1));
    setBusy(true);
    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratingUserId, songId }),
      });
      if (!res.ok) throw new Error("toggle failed");
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
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      title={liked ? "Unlike" : "Like"}
      className={`inline-flex items-center gap-1.5 text-sm transition-all -ml-1.5 -my-1 px-1.5 py-1 rounded-md ${
        liked
          ? "text-rose-400 hover:text-rose-300"
          : "text-neutral-400 hover:text-white"
      } active:scale-95 disabled:opacity-50`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
        className={`transition-transform ${liked ? "scale-110" : ""}`}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
