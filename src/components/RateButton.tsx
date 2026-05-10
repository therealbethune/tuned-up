"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { SongResult } from "@/lib/ytmusic";
import { scoreLabel } from "@/lib/score-labels";
import { isAlbumId } from "@/lib/songs";

type FriendRating = {
  userId: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  score: number;
  review: string | null;
};

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
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false); // controls the slide-in state
  const [scoreText, setScoreText] = useState<string>(String(initialScore ?? ""));
  const [review, setReview] = useState<string>(initialReview ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendRating[] | null>(null);
  const numberRef = useRef<HTMLInputElement | null>(null);

  // Animate in. We mount with open=true and translate-y-full, then flip to
  // translate-y-0 on the next frame to trigger the CSS transition. The
  // open=false case is handled by close(), which sets show=false before the
  // unmount delay.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Load friend ratings + my own when opening so the sheet has rich context.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/songs/${encodeURIComponent(song.id)}/social-ratings`,
        );
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled) return;
        setFriends(j.friends ?? []);
        // If the caller didn't pass an initialScore but we have one in the
        // DB, prefill from there.
        if (j.mine && (initialScore == null || initialScore === 0)) {
          setScoreText(String(j.mine.score));
          if (initialReview == null || initialReview === "") {
            setReview(j.mine.review ?? "");
          }
        }
      } catch {
        /* network error — leave friends as null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, song.id, initialScore, initialReview]);

  // Lock body scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Auto-focus + select the number on open (after animation begins).
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {
        numberRef.current?.focus();
        numberRef.current?.select();
      }, 250);
      return () => clearTimeout(t);
    }
  }, [open]);

  function changeScore(raw: string) {
    setScoreText(raw.replace(/[^0-9]/g, "").slice(0, 3));
  }

  function clampedScore(): number | null {
    if (scoreText === "") return null;
    const n = parseInt(scoreText, 10);
    if (isNaN(n)) return null;
    return Math.max(1, Math.min(100, n));
  }

  function close() {
    setShow(false);
    // Wait for the slide-out before unmounting.
    setTimeout(() => setOpen(false), 200);
  }

  // Escape-to-close while the dialog is open. Bound on document so it works
  // regardless of focus location.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
        close();
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
  const friendAvg =
    friends && friends.length > 0
      ? Math.round(
          friends.reduce((a, f) => a + f.score, 0) / friends.length,
        )
      : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-40 flex items-end sm:items-center justify-center transition-opacity duration-200 ${
        show ? "bg-black/60 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 max-h-[90vh] overflow-y-auto transform transition-transform duration-300 ease-out ${
          show ? "translate-y-0" : "translate-y-full sm:translate-y-4"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Top grabber + close */}
        <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800">
          <div className="flex items-center justify-between px-4 pt-3 pb-3">
            <div className="w-10 h-1 rounded-full bg-neutral-700 sm:hidden mx-auto absolute left-0 right-0 top-1.5" />
            <h2 className="text-base font-semibold">Rate this</h2>
            <button
              onClick={close}
              aria-label="Close"
              className="text-neutral-500 hover:text-white inline-flex items-center justify-center h-8 w-8"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Song header */}
          <div className="flex items-center gap-3">
            {song.thumbnail ? (
              <Image
                src={song.thumbnail}
                alt=""
                width={64}
                height={64}
                className="rounded h-16 w-16 object-cover shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded bg-neutral-800 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="font-semibold truncate">{song.title}</div>
                {isAlbumId(song.id) && (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    Album
                  </span>
                )}
              </div>
              <div className="text-sm text-neutral-400 truncate">
                {song.artist}
                {song.album ? ` · ${song.album}` : ""}
              </div>
            </div>
          </div>

          {/* Numeric input + live label */}
          <div className="flex items-end gap-4">
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
              className="w-32 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-3 text-4xl font-bold tabular-nums text-center placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600"
            />
            <div className="flex-1 pb-1.5">
              {label ? (
                <>
                  <div className={`text-xl font-bold ${label.color}`}>{label.label}</div>
                  <div className="text-xs text-neutral-500">out of 100</div>
                </>
              ) : (
                <div className="text-sm text-neutral-500">Type your score</div>
              )}
            </div>
          </div>

          {/* Optional review */}
          <div>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Why this score? (optional)"
              rows={3}
              maxLength={500}
              className="w-full rounded-md bg-neutral-900 border border-neutral-800 p-3 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
            />
            <div className="text-right text-xs text-neutral-500 mt-1">
              {review.length}/500
            </div>
          </div>

          {/* Friend ratings */}
          {friends == null ? (
            <p className="text-xs text-neutral-500">Loading friend ratings…</p>
          ) : friends.length === 0 ? (
            <p className="text-xs text-neutral-500">
              None of your follows have rated this yet.
            </p>
          ) : (
            <section className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-neutral-300">
                  Friends&apos; ratings
                </h3>
                {friendAvg != null && (
                  <div className="text-xs text-neutral-500">
                    avg <span className="text-neutral-200 tabular-nums font-medium">{friendAvg}</span>
                    {" · "}
                    <span className={scoreLabel(friendAvg).color}>
                      {scoreLabel(friendAvg).label}
                    </span>
                  </div>
                )}
              </div>
              <ul className="space-y-1.5">
                {friends.map((f) => {
                  const lbl = scoreLabel(f.score);
                  return (
                    <li
                      key={f.userId}
                      className="flex items-center gap-2.5 rounded-md bg-neutral-900/60 p-2"
                    >
                      <Link href={`/u/${f.username}`} className="shrink-0" onClick={close}>
                        {f.imageUrl ? (
                          <Image
                            src={f.imageUrl}
                            alt=""
                            width={28}
                            height={28}
                            className="rounded-full h-7 w-7"
                          />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-neutral-700" />
                        )}
                      </Link>
                      <Link
                        href={`/u/${f.username}`}
                        onClick={close}
                        className="flex-1 min-w-0 text-sm truncate hover:underline"
                      >
                        {f.displayName || f.username}
                      </Link>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold tabular-nums leading-none">
                          {f.score}
                        </div>
                        <div className={`text-[10px] font-medium ${lbl.color}`}>
                          {lbl.label}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={close}
              disabled={busy}
              className="rounded-full px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={busy || score == null}
              className="rounded-full bg-white text-black px-5 py-2 font-medium disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save rating"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
