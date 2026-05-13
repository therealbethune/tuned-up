"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SuggestedFriends } from "@/components/SuggestedFriends";
import { Avatar } from "@/components/Avatar";
import { SearchIcon } from "@/components/icons";

type UserResult = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
};

export default function PeoplePage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    // AbortController so a fast typist's stale request is actually
    // cancelled at the network layer, not just dropped by the reqId
    // guard after the bytes already came back. Matches the
    // MentionInput pattern.
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
      } catch {
        // Network error / 4xx — drop results silently. Without this
        // a transient failure would leave the spinner spinning forever
        // and surface as an unhandled promise rejection in dev tools.
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Find people</h1>
        <p className="text-neutral-400 text-sm">Search by username or name. Tap a result to view their ratings and follow.</p>
      </div>

      <SuggestedFriends />

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
          <SearchIcon size={16} />
        </span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="@username or name…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-full bg-neutral-900 border border-neutral-800 pl-11 pr-12 py-2.5 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
        />
        {loading ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
          </div>
        ) : q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-neutral-500 hover:text-white hover:bg-neutral-800 inline-flex items-center justify-center"
          >
            ×
          </button>
        ) : null}
      </div>

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((u) => (
            <li key={u.id}>
              <Link
                href={`/u/${u.username}`}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-900 p-3 transition-colors"
              >
                <Avatar
                  imageUrl={u.imageUrl}
                  name={u.displayName || u.username}
                  seed={u.id}
                  size={40}
                  ring={false}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.displayName || u.username}</div>
                  <div className="text-sm text-neutral-400 truncate">@{u.username}</div>
                </div>
                <div className="text-sm text-neutral-500 tabular-nums">
                  {u.ratingsCount} {u.ratingsCount === 1 ? "rating" : "ratings"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
          <p>
            No one found for <span className="text-white font-medium">&ldquo;{q.trim()}&rdquo;</span>.
          </p>
          <p className="text-neutral-400 text-xs mt-1">
            Try a different spelling, or invite them by sharing your profile link.
          </p>
        </div>
      )}
      {!loading && q.trim().length < 2 && (
        <p className="text-neutral-400 text-sm">
          Type a name or @handle to find people.
        </p>
      )}
    </div>
  );
}
