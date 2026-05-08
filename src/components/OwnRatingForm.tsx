"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { scoreLabel } from "@/lib/score-labels";

export type OwnRating = {
  songId: string;
  title: string;
  score: number;
  review: string | null;
};

export function OwnRatingForm({ rating }: { rating: OwnRating }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(rating.score);
  const [review, setReview] = useState(rating.review ?? "");
  const [busy, setBusy] = useState(false);

  function reset() {
    setScore(rating.score);
    setReview(rating.review ?? "");
  }

  async function save() {
    setBusy(true);
    // The /api/ratings POST endpoint upserts. We only have the songId here,
    // not the full song metadata — but the song row already exists, so we
    // can't use the existing handler which validates a full song body.
    // Use a dedicated edit endpoint instead.
    const res = await fetch("/api/ratings/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ songId: rating.songId, score, review: review.trim() || null }),
    });
    setBusy(false);
    if (res.ok) {
      setEditing(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Save failed");
    }
  }

  async function del() {
    if (!confirm(`Delete your rating of "${rating.title}"?`)) return;
    setBusy(true);
    const res = await fetch("/api/ratings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ songId: rating.songId }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Delete failed");
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 text-xs text-neutral-500">
        <button onClick={() => setEditing(true)} className="hover:text-white">
          Edit
        </button>
        <button onClick={del} disabled={busy} className="hover:text-red-400 disabled:opacity-50">
          Delete
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="flex-1 accent-white"
        />
        <div className="text-right">
          <div className="font-mono text-base tabular-nums">{score}</div>
          <div className={`text-[11px] font-medium ${scoreLabel(score).color}`}>
            {scoreLabel(score).label}
          </div>
        </div>
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
            onClick={() => {
              reset();
              setEditing(false);
            }}
            disabled={busy}
            className="text-sm text-neutral-400 hover:text-white px-2"
          >
            Cancel
          </button>
          <button
            onClick={save}
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
