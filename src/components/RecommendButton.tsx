"use client";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import type { SongResult } from "@/lib/ytmusic";
import { MentionInput } from "@/components/MentionInput";
import { useScrollLock } from "@/lib/use-scroll-lock";

type FoundUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
};

export function RecommendButton({ song }: { song: SongResult }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [picked, setPicked] = useState<FoundUser | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  // Remember the trigger button so we can restore focus after the modal
  // closes — important for keyboard + screen-reader users.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);

  useScrollLock(open);

  useEffect(() => {
    // When transitioning from open → closed, return focus to the trigger.
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // Debounced user search with AbortController so unmount + rapid retypes
  // don't dump stale data into state or warn about setState-on-unmounted.
  useEffect(() => {
    if (!open || picked) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(term)}`,
          { signal: ctrl.signal },
        );
        if (id !== reqId.current) return;
        const data = await res.json();
        if (id !== reqId.current) return;
        setResults(data.results ?? []);
      } catch (e) {
        // AbortError when superseded — silent. Other errors clear results.
        if ((e as Error).name === "AbortError") return;
        if (id === reqId.current) setResults([]);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, picked]);

  function reset() {
    setQ("");
    setResults([]);
    setPicked(null);
    setMessage("");
    setDone(false);
  }

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        reset();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toUsername: picked.username,
          song,
          message: message.trim() || null,
        }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => {
          setOpen(false);
          reset();
        }, 1200);
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Couldn't send (HTTP ${res.status}).`);
      }
    } catch (e) {
      setError((e as Error).message || "Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1.5"
        title="Recommend to a friend"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 11l18-8-8 18-2-8-8-2z" />
        </svg>
        Recommend
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setOpen(false);
            reset();
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-4 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">Recommend song</h3>
                <p className="text-sm text-neutral-400 truncate">
                  {song.title} · {song.artist}
                </p>
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                aria-label="Close"
                className="text-neutral-500 hover:text-white inline-flex items-center justify-center h-11 w-11"
              >
                ×
              </button>
            </div>

            {done ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/40 p-4 text-sm text-emerald-300">
                ✓ Sent to @{picked?.username}
              </div>
            ) : !picked ? (
              <>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search a friend by name or @handle…"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-full bg-neutral-950 border border-neutral-800 px-4 py-2 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
                />
                {q.trim().length >= 2 && (
                  <ul className="max-h-64 overflow-y-auto space-y-1">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          onClick={() => setPicked(u)}
                          className="w-full flex items-center gap-3 rounded-md p-2 hover:bg-neutral-800 text-left"
                        >
                          <Avatar
                            imageUrl={u.imageUrl}
                            name={u.displayName || u.username}
                            seed={u.id}
                            size={36}
                            ring={false}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{u.displayName || u.username}</div>
                            <div className="text-xs text-neutral-400 truncate">@{u.username}</div>
                          </div>
                        </button>
                      </li>
                    ))}
                    {results.length === 0 && (
                      <li className="text-sm text-neutral-500 px-2 py-1">No matches.</li>
                    )}
                  </ul>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-md bg-neutral-950 border border-neutral-800 p-2">
                  <Avatar
                    imageUrl={picked.imageUrl}
                    name={picked.displayName || picked.username}
                    seed={picked.id}
                    size={32}
                    ring={false}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{picked.displayName || picked.username}</div>
                    <div className="text-xs text-neutral-400 truncate">@{picked.username}</div>
                  </div>
                  <button
                    onClick={() => setPicked(null)}
                    className="text-xs text-neutral-400 hover:text-white"
                  >
                    Change
                  </button>
                </div>
                <MentionInput
                  as="textarea"
                  value={message}
                  onChange={setMessage}
                  placeholder="Add a note (optional). Use @ to mention…"
                  rows={3}
                  maxLength={200}
                  className="w-full rounded-md bg-neutral-950 border border-neutral-800 p-2 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-500">{message.length}/200</span>
                  <button
                    onClick={send}
                    disabled={busy}
                    className="rounded-full bg-white text-black px-5 py-1.5 font-medium disabled:opacity-50"
                  >
                    {busy ? "Sending…" : "Send"}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-400">{error}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
