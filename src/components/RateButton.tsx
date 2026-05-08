"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SongResult } from "@/lib/ytmusic";
import { scoreLabel } from "@/lib/score-labels";

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
  const [scoreText, setScoreText] = useState<string>(String(initialScore ?? ""));
  const [review, setReview] = useState<string>(initialReview ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement | null>(null);

  // Focus + select-all on open so users can immediately type a new number
  // even if a previous score is prefilled.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        numberRef.current?.focus();
        numberRef.current?.select();
      });
    }
  }, [open]);

  function changeScore(raw: string) {
    // Strip non-digits, cap to 3 chars (max input is 100).
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 3);
    setScoreText(digits);
  }

  function clampedScore(): number | null {
    if (scoreText === "") return null;
    const n = parseInt(scoreText, 10);
    if (isNaN(n)) return null;
    return Math.max(1, Math.min(100, n));
  }

  async function submit() {
    const score = clampedScore();
    if (score == null) {
      setError("Enter a score from 1 to 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ song, score, review: review.trim() || null }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("song-rated", { detail: { songId: song.id } }),
          );
        }
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed to save (HTTP ${res.status}).`);
      }
    } catch (e) {
      setError((e as Error).message || "Network error — try again.");
    } finally {
      setBusy(false);
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

  const score = clampedScore();
  const label = score != null ? scoreLabel(score) : null;

  return (
    <div className="flex flex-col gap-3 w-full sm:w-72 sm:max-w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-3">
        <input
          ref={numberRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          value={scoreText}
          onChange={(e) => changeScore(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Score from 1 to 100"
          placeholder="1–100"
          className="w-24 rounded-md bg-neutral-950 border border-neutral-800 px-3 py-2 text-2xl font-bold tabular-nums text-center placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600"
        />
        <div className="flex-1">
          {label ? (
            <>
              <div className={`text-base font-semibold ${label.color}`}>{label.label}</div>
              <div className="text-xs text-neutral-500">out of 100</div>
            </>
          ) : (
            <div className="text-xs text-neutral-500">Type your score</div>
          )}
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
            onClick={() => setOpen(false)}
            className="text-sm text-neutral-400 hover:text-white px-2"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || score == null}
            className="rounded-full bg-white text-black px-4 py-1 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
