"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { renderWithMentions } from "@/lib/mentions";
import { MentionInput, type MentionInputHandle } from "@/components/MentionInput";

type Comment = {
  id: string;
  body: string;
  createdAt: string | Date;
  commenterId: string;
  parentCommentId: string | null;
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
  const [error, setError] = useState<string | null>(null);
  // The id of the comment we're replying to (controls which inline reply
  // form is open). null means "post a top-level comment via the bottom box".
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const inputRef = useRef<MentionInputHandle | null>(null);
  const replyInputRef = useRef<MentionInputHandle | null>(null);

  const count = comments?.length ?? initialCount;

  // Group comments into top-level + their replies. Replies to replies were
  // re-parented server-side, so a single map suffices.
  const grouped = useMemo(() => {
    const list = comments ?? [];
    const tops: Comment[] = [];
    const repliesByParent = new Map<string, Comment[]>();
    for (const c of list) {
      if (!c.parentCommentId) {
        tops.push(c);
      } else {
        const arr = repliesByParent.get(c.parentCommentId) ?? [];
        arr.push(c);
        repliesByParent.set(c.parentCommentId, arr);
      }
    }
    return { tops, repliesByParent };
  }, [comments]);

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

  async function submitTopLevel() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ratingUserId, songId, body: text }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.comment) {
        setComments((prev) => [...(prev ?? []), j.comment]);
        setBody("");
      } else {
        setError(j.error || `Couldn't post (HTTP ${res.status}).`);
      }
    } catch (e) {
      setError((e as Error).message || "Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function startReply(c: Comment) {
    setReplyTo(c.id);
    // Prefill with @author so it reads naturally and triggers a mention.
    setReplyBody(c.username && c.username !== "" ? `@${c.username} ` : "");
    requestAnimationFrame(() => replyInputRef.current?.focus());
  }

  function cancelReply() {
    setReplyTo(null);
    setReplyBody("");
  }

  async function submitReply(parentId: string) {
    const text = replyBody.trim();
    if (!text || replyBusy) return;
    setReplyBusy(true);
    setReplyError(null);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ratingUserId,
          songId,
          body: text,
          parentCommentId: parentId,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.comment) {
        setComments((prev) => [...(prev ?? []), j.comment]);
        setReplyBody("");
        setReplyTo(null);
      } else {
        setReplyError(j.error || `Couldn't post reply (HTTP ${res.status}).`);
      }
    } catch (e) {
      setReplyError((e as Error).message || "Network error — try again.");
    } finally {
      setReplyBusy(false);
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
      // Also drop any replies whose parent we just removed.
      setComments((prev) =>
        (prev ?? []).filter((c) => c.id !== id && c.parentCommentId !== id),
      );
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
              {grouped.tops.map((c) => (
                <li key={c.id} className="space-y-2">
                  <CommentRow
                    c={c}
                    viewerId={viewerId}
                    onDelete={() => del(c.id)}
                    onReply={() => startReply(c)}
                  />
                  {/* Replies + inline reply form */}
                  {((grouped.repliesByParent.get(c.id) ?? []).length > 0 ||
                    replyTo === c.id) && (
                    <div className="ml-8 space-y-2 border-l border-neutral-800 pl-3">
                      {(grouped.repliesByParent.get(c.id) ?? []).map((r) => (
                        <CommentRow
                          key={r.id}
                          c={r}
                          viewerId={viewerId}
                          onDelete={() => del(r.id)}
                          onReply={() => startReply(r)}
                        />
                      ))}
                      {replyTo === c.id && (
                        <div>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              submitReply(c.id);
                            }}
                            className="flex gap-2"
                          >
                            <div className="flex-1">
                              <MentionInput
                                ref={replyInputRef}
                                value={replyBody}
                                onChange={setReplyBody}
                                onSubmit={() => submitReply(c.id)}
                                placeholder={`Reply to @${c.username}…`}
                                maxLength={1000}
                                className="w-full rounded-full bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={replyBusy || !replyBody.trim()}
                              className="rounded-full bg-white text-black px-3 py-1.5 text-sm font-medium disabled:opacity-50 shrink-0"
                            >
                              {replyBusy ? "…" : "Post"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelReply}
                              className="text-xs text-neutral-500 hover:text-white px-1"
                            >
                              Cancel
                            </button>
                          </form>
                          {replyError && (
                            <p className="mt-1 text-xs text-red-400">{replyError}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitTopLevel();
              }}
              className="flex gap-2"
            >
              <div className="flex-1">
                <MentionInput
                  ref={inputRef}
                  value={body}
                  onChange={setBody}
                  onSubmit={submitTopLevel}
                  placeholder="Add a comment… use @ to mention"
                  maxLength={1000}
                  className="w-full rounded-full bg-neutral-950 border border-neutral-800 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !body.trim()}
                className="rounded-full bg-white text-black px-3 py-1.5 text-sm font-medium disabled:opacity-50 shrink-0"
              >
                {busy ? "…" : "Post"}
              </button>
            </form>
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  c,
  viewerId,
  onDelete,
  onReply,
}: {
  c: Comment;
  viewerId: string;
  onDelete: () => void;
  onReply: () => void;
}) {
  return (
    <div className="flex gap-2 rounded-md border border-neutral-800 bg-neutral-900 p-2">
      {c.imageUrl ? (
        <Image
          src={c.imageUrl}
          alt=""
          width={24}
          height={24}
          className="rounded-full h-6 w-6 shrink-0"
        />
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
              onClick={onDelete}
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
        <button
          onClick={onReply}
          className="mt-1 text-[11px] text-neutral-500 hover:text-white"
        >
          Reply
        </button>
      </div>
    </div>
  );
}
