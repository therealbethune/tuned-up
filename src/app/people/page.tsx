"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SuggestedFriends } from "@/components/SuggestedFriends";
import { Avatar } from "@/components/Avatar";
import { SearchIcon } from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import { toast } from "@/lib/toast";

type FollowState = "none" | "pending" | "accepted" | "self";
type UserResult = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
  followStatus: FollowState;
};

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const reqId = useRef(0);

  // Debounced search. We intentionally setState inside the effect:
  // clear results / flip loading state when the input changes, then
  // fire a delayed request from inside setTimeout. The dep array is
  // just `[q]` so this only re-fires when the user types — no
  // cascading-render risk. The lint rule misclassifies this; the
  // suppression below covers the whole effect body.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(term)}`, {
          signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (id !== reqId.current) return;
        setResults(data.results ?? []);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Inline follow — flips the row's status optimistically so the
  // button responds immediately even with a 200-300ms server roundtrip.
  async function follow(u: UserResult) {
    if (actingId === u.id || u.followStatus === "self") return;
    setActingId(u.id);
    const prevStatus = u.followStatus;
    const optimistic: FollowState = prevStatus === "none" ? "accepted" : "none";
    setResults((rs) => rs.map((r) => (r.id === u.id ? { ...r, followStatus: optimistic } : r)));
    try {
      const action = prevStatus === "none" ? "follow" : "unfollow";
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: u.username, action }),
      });
      if (!res.ok) {
        setResults((rs) => rs.map((r) => (r.id === u.id ? { ...r, followStatus: prevStatus } : r)));
        await toast.fromResponse(res, "Couldn't update follow");
        return;
      }
      const j = await res.json().catch(() => ({}));
      const next: FollowState =
        action === "unfollow"
          ? "none"
          : j.status === "pending"
            ? "pending"
            : "accepted";
      setResults((rs) => rs.map((r) => (r.id === u.id ? { ...r, followStatus: next } : r)));
      if (action === "follow") {
        toast.success(
          next === "pending" ? `Request sent to @${u.username}` : `Now following @${u.username}`,
        );
      }
    } finally {
      setActingId(null);
    }
  }

  const term = q.trim();
  const showSuggestions = term.length === 0;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold">Find people</h1>
        <p className="text-neutral-400 text-sm">
          Search by username or name, or follow people Tuned Up thinks share your taste.
        </p>
      </div>

      {/* Search input. autoFocus removed so opening /people doesn't
          immediately pop the iOS keyboard + shift the layout — the
          user might want to scroll the suggestions first. */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
          <SearchIcon size={18} />
        </span>
        <input
          type="search"
          aria-label="Search people by username or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search @username or name…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="w-full rounded-full bg-neutral-900 border border-neutral-800 pl-12 pr-12 py-3 text-base placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all"
        />
        {loading ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Spinner size={18} />
          </div>
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800 inline-flex items-center justify-center"
            style={{ transform: "translateY(-50%)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {showSuggestions ? (
        <SuggestedFriends />
      ) : (
        <>
          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((u) => {
                const isSelf = u.followStatus === "self";
                const busy = actingId === u.id;
                const followLabel =
                  u.followStatus === "accepted"
                    ? "Following"
                    : u.followStatus === "pending"
                      ? "Requested"
                      : "Follow";
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 hover:border-neutral-700 p-3 transition-colors"
                  >
                    <Link
                      href={`/u/${u.username}`}
                      className="flex items-center gap-3 flex-1 min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 rounded"
                    >
                      <Avatar
                        imageUrl={u.imageUrl}
                        name={u.displayName || u.username}
                        seed={u.id}
                        size={44}
                        ring={false}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {u.displayName || u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wider rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-400 truncate tabular-nums">
                          @{u.username} · {u.ratingsCount} {u.ratingsCount === 1 ? "rating" : "ratings"}
                        </div>
                      </div>
                    </Link>
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => follow(u)}
                        disabled={busy}
                        className={`rounded-full text-sm font-medium px-4 py-2 min-h-9 active:scale-95 transition-all disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60 ${
                          u.followStatus === "none"
                            ? "bg-white text-black hover:bg-neutral-200"
                            : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
                        }`}
                      >
                        {busy ? "…" : followLabel}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && term.length >= 1 && results.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 text-center space-y-2">
              <div className="text-3xl" aria-hidden>🔍</div>
              <p className="text-sm">
                No one found for{" "}
                <span className="text-white font-medium">&ldquo;{term}&rdquo;</span>.
              </p>
              <p className="text-xs text-neutral-400">
                Try a different spelling, or check if their handle uses underscores or numbers.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
