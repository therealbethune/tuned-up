"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { renderWithMentions } from "@/lib/mentions";

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

type MentionCandidate = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
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

  // Mention typeahead state
  const inputRef = useRef<HTMLInputElement>(null);
  const [mentionAt, setMentionAt] = useState<number | null>(null);
  const [mentionPartial, setMentionPartial] = useState<string>("");
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const candReqId = useRef(0);

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

  // Detect whether the cursor is inside a `@partial` token. If so, surface
  // the typeahead. Otherwise hide it.
  function detectMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt < 0) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    const between = before.slice(lastAt + 1);
    if (!/^[a-zA-Z0-9_]*$/.test(between)) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    // The @ must be at the start or preceded by whitespace.
    if (lastAt > 0 && !/\s/.test(value[lastAt - 1])) {
      setMentionAt(null);
      setMentionPartial("");
      return;
    }
    setMentionAt(lastAt);
    setMentionPartial(between);
    setActiveIdx(0);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBody(v);
    detectMention(v, e.target.selectionStart ?? v.length);
  }

  // Debounced fetch of mention candidates.
  useEffect(() => {
    if (mentionAt == null || mentionPartial.length < 1) {
      setCandidates([]);
      return;
    }
    const id = ++candReqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(mentionPartial)}`);
        const data = await res.json();
        if (id !== candReqId.current) return;
        setCandidates((data.results ?? []).slice(0, 5));
      } catch {
        if (id === candReqId.current) setCandidates([]);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [mentionAt, mentionPartial]);

  function pickMention(c: MentionCandidate) {
    if (mentionAt == null) return;
    const tokenLen = 1 + mentionPartial.length; // "@" + partial
    const before = body.slice(0, mentionAt);
    const after = body.slice(mentionAt + tokenLen);
    const insert = `@${c.username} `;
    const next = before + insert + after;
    setBody(next);
    setMentionAt(null);
    setMentionPartial("");
    setCandidates([]);
    const newCursor = before.length + insert.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionAt == null || candidates.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % candidates.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + candidates.length) % candidates.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(candidates[activeIdx]);
    } else if (e.key === "Escape") {
      setMentionAt(null);
      setMentionPartial("");
      setCandidates([]);
    }
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
        setMentionAt(null);
        setMentionPartial("");
        setCandidates([]);
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

  const showTypeahead = mentionAt != null && candidates.length > 0;

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
                      {renderWithMentions(c.body)}
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

          <form onSubmit={submit} className="relative flex gap-2">
            <input
              ref={inputRef}
              value={body}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onBlur={() => {
                // Close the typeahead on blur, but only after the click has
                // a chance to register on a suggestion.
                setTimeout(() => {
                  setMentionAt(null);
                  setCandidates([]);
                }, 120);
              }}
              placeholder="Add a comment… use @ to mention"
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

            {showTypeahead && (
              <ul className="absolute left-0 right-12 bottom-full mb-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg text-sm">
                {candidates.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      // onMouseDown so we trigger before the input's onBlur.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(c);
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                        i === activeIdx ? "bg-neutral-800" : "hover:bg-neutral-800/60"
                      }`}
                    >
                      {c.imageUrl ? (
                        <Image src={c.imageUrl} alt="" width={24} height={24} className="rounded-full h-6 w-6" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-neutral-700" />
                      )}
                      <span className="font-medium truncate">{c.displayName || c.username}</span>
                      <span className="text-neutral-500 truncate">@{c.username}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
