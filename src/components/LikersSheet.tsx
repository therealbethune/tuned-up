"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { relativeTime } from "@/lib/songs";
import { Avatar } from "@/components/Avatar";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { RowSkeleton } from "@/components/RowSkeleton";

type Liker = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  createdAt: string | Date;
};

// Bottom-sheet / modal showing who liked a rating. Lazy-fetches when open.
// Uses the same translate-y animation pattern as RateButton, plus Esc
// close and backdrop-click close.
export function LikersSheet({
  open,
  ratingUserId,
  songId,
  onClose,
}: {
  open: boolean;
  ratingUserId: string;
  songId: string;
  onClose: () => void;
}) {
  const [likers, setLikers] = useState<Liker[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  // Remember what was focused before open so we can restore it on close.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useScrollLock(open);

  // Slide-in animation: mount first, then translate after next frame.
  // Also: capture the previously-focused element on open, move focus to
  // the Close button (default a11y target), and restore focus on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        (document.activeElement as HTMLElement | null) ?? null;
      const id = requestAnimationFrame(() => {
        setShow(true);
        closeBtnRef.current?.focus();
      });
      return () => cancelAnimationFrame(id);
    } else {
      setShow(false);
      const prev = previouslyFocusedRef.current;
      if (prev && document.contains(prev)) prev.focus();
    }
  }, [open]);

  // Esc-to-close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Fetch on first open. Re-fetch each open since likes can change.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/likes?u=${encodeURIComponent(ratingUserId)}&s=${encodeURIComponent(songId)}`,
          { cache: "no-store" },
        );
        const j = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setLikers(j.likers ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Couldn't load likes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ratingUserId, songId]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="People who liked this"
      className={`fixed inset-0 z-40 flex items-end sm:items-center justify-center transition-opacity duration-200 ${
        show ? "bg-black/60 backdrop-blur-sm" : "bg-black/0"
      }`}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 max-h-[80vh] overflow-y-auto sheet-scroll transform transition-transform duration-300 ease-out ${
          show ? "translate-y-0" : "translate-y-full sm:translate-y-4"
        }`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 pt-3 pb-3 flex items-center justify-between">
          <div className="w-10 h-1 rounded-full bg-neutral-700 sm:hidden mx-auto absolute left-0 right-0 top-1.5" />
          <h2 className="text-base font-semibold">Liked by</h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-white inline-flex items-center justify-center h-11 w-11"
          >
            ×
          </button>
        </div>

        <div className="p-2">
          {loading && likers == null ? (
            <div className="p-2">
              <RowSkeleton size={36} lines={2} count={4} />
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-red-400">{error}</p>
          ) : likers && likers.length === 0 ? (
            <p className="p-6 text-sm text-neutral-500 text-center">
              Nobody&apos;s liked this yet. Be the first.
            </p>
          ) : (
            <ul>
              {likers?.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/u/${l.username}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-md hover:bg-neutral-900/60 px-2 py-2 transition-colors"
                  >
                    <Avatar
                      imageUrl={l.imageUrl}
                      name={l.displayName || l.username}
                      seed={l.id}
                      size={36}
                      ring={false}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {l.displayName || l.username}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        @{l.username} · {relativeTime(l.createdAt)}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
