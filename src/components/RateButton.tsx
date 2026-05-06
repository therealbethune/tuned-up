"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SongResult } from "@/lib/ytmusic";

export function RateButton({
  song,
  initialScore,
  initialReview,
}: {
  song: SongResult;
  initialScore?: number | null;
  initialReview?: string | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState<number>(initialScore ?? 50);
  const [review, setReview] = useState<string>(initialReview ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ song, score, review: review.trim() || null }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to save rating");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium hover:bg-neutral-200 shrink-0"
      >
        {initialScore ? `Rated ${initialScore}` : "Rate"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 w-72 max-w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="flex-1 accent-white"
        />
        <span className="font-mono text-base w-10 text-right tabular-nums">{score}</span>
      </div>
      <textarea
        value={review}
        onChange={(e) => setReview(e.target.value)}
        placeholder="Why this score? (optional)"
        rows={3}
        maxLength={500}
        className="rounded-md bg-neutral-950 border border-neutral-800 p-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-500">{review.length}/500</span>
        <div className="flex gap-2">
          <button
            onClick={() => setOpen(false)}
            className="text-sm text-neutral-400 hover:text-white px-2"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="rounded-full bg-white text-black px-4 py-1 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
