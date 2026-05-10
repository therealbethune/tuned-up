"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { scoreLabel } from "@/lib/score-labels";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MentionInput } from "@/components/MentionInput";

export type OwnRating = {
  songId: string;
  title: string;
  score: number;
  review: string | null;
};

export function OwnRatingForm({ rating }: { rating: OwnRating }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [scoreText, setScoreText] = useState<string>(String(rating.score));
  const [review, setReview] = useState(rating.review ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        numberRef.current?.focus();
        numberRef.current?.select();
      });
    }
  }, [editing]);

  function reset() {
    setScoreText(String(rating.score));
    setReview(rating.review ?? "");
    setError(null);
  }

  function changeScore(raw: string) {
    setScoreText(raw.replace(/[^0-9]/g, "").slice(0, 3));
  }

  function clampedScore(): number | null {
    if (scoreText === "") return null;
    const n = parseInt(scoreText, 10);
    if (isNaN(n)) return null;
    return Math.max(1, Math.min(100, n));
  }

  async function save() {
    const score = clampedScore();
    if (score == null) {
      setError("Enter a score from 1 to 100.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ratings/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId: rating.songId, score, review: review.trim() || null }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Save failed (HTTP ${res.status}).`);
      }
    } catch (e) {
      setError((e as Error).message || "Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function del() {
    setBusy(true);
    const res = await fetch("/api/ratings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ songId: rating.songId }),
    });
    setBusy(false);
    setConfirmingDelete(false);
    if (res.ok) router.refresh();
    else setError("Delete failed — try again.");
  }

  if (!editing) {
    return (
      <>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <button onClick={() => setEditing(true)} className="hover:text-white">
            Edit
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            className="hover:text-red-400 disabled:opacity-50"
          >
            Delete
          </button>
          {error && <span className="text-red-400">{error}</span>}
        </div>
        <ConfirmDialog
          open={confirmingDelete}
          onClose={() => setConfirmingDelete(false)}
          onConfirm={del}
          title="Delete this rating?"
          body={`Your rating of "${rating.title}" will be removed.`}
          confirmLabel="Delete"
          destructive
          busy={busy}
        />
      </>
    );
  }

  const score = clampedScore();
  const label = score != null ? scoreLabel(score) : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-700 bg-neutral-900 p-3">
      <div className="flex items-center gap-3">
        <input
          ref={numberRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          role="spinbutton"
          aria-valuemin={1}
          aria-valuemax={100}
          aria-valuenow={clampedScore() ?? undefined}
          value={scoreText}
          onChange={(e) => changeScore(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
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
      <MentionInput
        as="textarea"
        value={review}
        onChange={setReview}
        placeholder="Why this score? Use @ to tag friends. (optional)"
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
