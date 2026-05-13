"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Avatar } from "@/components/Avatar";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { toast } from "@/lib/toast";
import { RowSkeleton } from "@/components/RowSkeleton";
import Link from "next/link";
import type { SongResult } from "@/lib/ytmusic";
import { scoreLabel } from "@/lib/score-labels";
import { isAlbumId } from "@/lib/songs";
import { MentionInput } from "@/components/MentionInput";
import { encodeBase64Url } from "@/lib/encoding";

type FriendRating = {
  userId: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  score: number;
  review: string | null;
};

type SimilarSuggestion = {
  id: string;
  kind: "song" | "album";
  title: string;
  artist: string;
  album: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  avg: number | null;
  n: number;
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
  // Post-rate "What's next" panel: once a rating saves successfully,
  // we swap the modal body for 3 collaborative-filtering suggestions.
  // Stays open until the user dismisses or picks one, so a rating
  // session can chain into the next pick without leaving the sheet.
  const [postRate, setPostRate] = useState<null | { score: number; suggestions: SimilarSuggestion[] | null }>(null);

  // Animate in. We mount with open=true and translate-y-full, then flip to
  // translate-y-0 on the next frame to trigger the CSS transition.
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(id);
    } else {
      setShow(false);
    }
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

  useScrollLock(open);

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
    setTimeout(() => {
      setOpen(false);
      setPostRate(null);
    }, 200);
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
        router.refresh();
        toast.success(`Rated ${song.title} — ${score}/100`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("song-rated", { detail: { songId: song.id } }),
          );
        }
        // Switch the modal body to the "What's next?" panel. We fetch
        // suggestions in parallel — render the panel immediately with
        // a small skeleton so the user gets instant feedback that the
        // rating saved.
        setPostRate({ score, suggestions: null });
        try {
          const sugRes = await fetch(
            `/api/suggestions/similar?songId=${encodeURIComponent(song.id)}&score=${score}`,
          );
          if (sugRes.ok) {
            const j = await sugRes.json();
            setPostRate({ score, suggestions: j.suggestions ?? [] });
          } else {
            setPostRate({ score, suggestions: [] });
          }
        } catch {
          setPostRate({ score, suggestions: [] });
        }
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Failed to save (HTTP ${res.status}).`);
        await toast.fromResponse(res, "Couldn't save rating");
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
        className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium hover:bg-neutral-200 shrink-0 active:scale-95 transition-transform"
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
      onClick={busy ? undefined : close}
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
            <h2 className="text-base font-semibold">
              {postRate ? "What's next?" : "Rate this"}
            </h2>
            <button
              onClick={close}
              aria-label="Close"
              className="text-neutral-500 hover:text-white inline-flex items-center justify-center h-11 w-11"
            >
              ×
            </button>
          </div>
        </div>

        {postRate ? (
          <PostRatePanel
            score={postRate.score}
            song={song}
            suggestions={postRate.suggestions}
            onClose={close}
          />
        ) : (

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

          {/* Numeric input + live label. The number itself tier-colors
              live as the user types — 35 reads red, 75 lime, 95
              emerald. Immediate visual feedback for the verdict they
              just committed to, before they even tap Save. */}
          <div className="flex items-end gap-4">
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
                  submit();
                }
              }}
              aria-label="Score from 1 to 100"
              placeholder="1–100"
              className={`w-32 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-3 text-4xl font-bold tabular-nums text-center placeholder:text-neutral-700 focus:outline-none focus:border-neutral-600 transition-colors ${
                label ? label.color : ""
              }`}
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

          {/* Optional review — supports @-mentions */}
          <div>
            <MentionInput
              as="textarea"
              value={review}
              onChange={setReview}
              placeholder="Why this score? Use @ to tag friends. (optional)"
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
            <RowSkeleton size={28} lines={2} count={2} />
          ) : friends.length === 0 ? (
            <p className="text-xs text-neutral-400">
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
                        <Avatar
                          imageUrl={f.imageUrl}
                          name={f.displayName || f.username}
                          seed={f.userId}
                          size={28}
                          ring={false}
                        />
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
              className="rounded-full bg-white text-black px-5 py-2 font-medium disabled:opacity-50 active:scale-95 transition-transform"
            >
              {busy ? "Saving…" : "Save rating"}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

// Renders the "What's next?" sheet after a successful rating: a short
// confirmation header for the rating that just landed, plus up to 3
// collaborative-filter suggestions. Each suggestion deep-links to the
// dedicated /album/<id> page where the same rate flow is one tap away,
// so the user can chain into the next pick without leaving Tuned Up.
function PostRatePanel({
  score,
  song,
  suggestions,
  onClose,
}: {
  score: number;
  song: SongResult;
  suggestions: SimilarSuggestion[] | null;
  onClose: () => void;
}) {
  const tier = scoreLabel(score);
  return (
    <div className="p-4 space-y-5">
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 flex items-center gap-3">
        {song.thumbnail ? (
          <Image
            src={song.thumbnail}
            alt=""
            width={48}
            height={48}
            className="rounded h-12 w-12 object-cover shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded bg-neutral-800 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-emerald-300/80">
            Saved
          </div>
          <div className="font-medium truncate">{song.title}</div>
          <div className="text-xs text-neutral-400 truncate">{song.artist}</div>
        </div>
        <div className="text-right leading-tight">
          <div className={`text-3xl font-bold tabular-nums ${tier.color}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-400">
            {tier.label}
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Similar to your taste</h3>
        <p className="text-xs text-neutral-400 -mt-1">
          Based on what other people who rated this song similarly also liked.
        </p>
        {suggestions == null ? (
          <ul className="space-y-2">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </ul>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-neutral-500">
            We&apos;ll have suggestions once more people rate this song. Keep rating!
          </p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/album/${encodeBase64Url(s.id)}`}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 hover:border-neutral-700 transition-colors p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
                >
                  {s.thumbnail ? (
                    <Image
                      src={s.thumbnail}
                      alt=""
                      width={44}
                      height={44}
                      className="rounded h-11 w-11 object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded bg-neutral-800 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.title}</div>
                    <div className="text-xs text-neutral-400 truncate">{s.artist}</div>
                  </div>
                  {s.avg != null && (
                    <div className="text-right shrink-0 leading-tight">
                      <div className={`text-xl font-bold tabular-nums ${scoreLabel(s.avg).color}`}>
                        {s.avg}
                      </div>
                      <div className="text-[10px] text-neutral-500">avg</div>
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="rounded-full bg-white text-black px-5 py-2 font-medium active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        >
          Done
        </button>
      </div>
    </div>
  );
}
