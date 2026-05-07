"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SuggestedFriends } from "@/components/SuggestedFriends";

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
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (id !== reqId.current) return;
        setResults(data.results ?? []);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Find people</h1>
        <p className="text-neutral-400 text-sm">Search by username or name. Tap a result to view their ratings and follow.</p>
      </div>

      <SuggestedFriends />

      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="@username or name…"
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
                {u.imageUrl ? (
                  <Image src={u.imageUrl} alt="" width={40} height={40} className="rounded-full h-10 w-10" />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-neutral-700" />
                )}
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
        <p className="text-neutral-500 text-sm">No people found.</p>
      )}
      {!loading && q.trim().length < 2 && (
        <p className="text-neutral-500 text-sm">Type at least 2 characters.</p>
      )}
    </div>
  );
}
