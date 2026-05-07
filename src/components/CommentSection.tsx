"use client";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

type Comment = {
  id: string;
  body: string;
  createdAt: string | Date;
  commenterId: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  score: number | null;
  review: string | null;
};

export function CommentSection({
  ratingUserId,
  songId,
  viewerId,
  initialCount,
}: {
  ratingUserId: string;
  songId: string;
  viewerId: string;
  initialCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const count = comments?.length ?? initialCount;

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/comments?u=${encodeURIComponent(ratingUserId)}&s=${encodeURIComponent(songId)}`,
      );
      const j = await res.json();
      setComments(j.comments ?? []);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    if (!open && comments == null) load();
    setOpen(!open);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratingUserId, songId, body: text }),
      });
      const j = await res.json();
      if (res.ok && j.comment) {
        setComments((prev) => [...(prev ?? []), j.comment]);
        setBody("");
      } else {
        alert(j.error || "Failed to post comment");
      }
    } finally {
      setBusy(false);
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this comment?")) return;
    const res = await fetch("/api/comments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentId: id }),
    });
    if (res.ok) {
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {count > 0 ? `${count} ${count === 1 ? "comment" : "comments"}` : "Comment"}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && comments == null ? (
            <p className="text-xs text-neutral-500">Loading…</p>
          ) : (
            <ul className="space-y-2">
              {(comments ?? []).map((c) => (
                <li key={c.id} className="flex gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-2">
                  {c.imageUrl ? (
                    <Image src={c.imageUrl} alt="" width={24} height={24} className="rounded-full h-6 w-6 shrink-0" />
                  ) : (
                    <div className="h-6 w-6 rounded-full bg-neutral-700 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs flex items-center gap-1.5 flex-wrap">
                      <Link href={`/u/${c.username}`} className="font-medium hover:underline">
                        @{c.username}
                      </Link>
                      {c.score != null && (
                        <span className="text-neutral-500">
                          rated <span className="text-neutral-200 font-medium tabular-nums">{c.score}</span>
                        </span>
                      )}
                      {c.commenterId === viewerId && (
                        <button
                          onClick={() => del(c.id)}
                          className="ml-auto text-neutral-500 hover:text-red-400"
                          title="Delete"
                          aria-label="Delete comment"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-neutral-200 mt-0.5 break-words whitespace-pre-wrap">
                      {c.body}
                    </p>
                    {c.review && (
                      <blockquote className="mt-1.5 border-l-2 border-neutral-700 pl-2 text-xs text-neutral-400 italic break-words whitespace-pre-wrap">
                        Their review: {c.review}
                      </blockquote>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submit} className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment…"
              maxLength={1000}
              className="flex-1 rounded-full bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="rounded-full bg-white text-black px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
