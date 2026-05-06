"use client";
import { useEffect, useRef, useState } from "react";
import { SongRow } from "@/components/SongRow";
import type { SongResult } from "@/lib/ytmusic";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  // Debounced search-as-you-type
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        // ignore stale responses
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(data.error || "search failed");
        setResults(data.results ?? []);
        setError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const top = results[0];
  const rest = results.slice(1);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Find a song</h1>
        <p className="text-neutral-400 text-sm">Search YouTube Music. Click the album art to open the track.</p>
      </div>

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
          placeholder="Song, artist, album…"
          className="w-full rounded-full bg-neutral-900 border border-neutral-800 pl-11 pr-12 py-2.5 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {top && (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">Top result</h2>
          <SongRow song={top} highlight />
        </div>
      )}

      {rest.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500">More results</h2>
          <div className="space-y-2">
            {rest.map((s) => (
              <SongRow key={s.id} song={s} />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && q.trim().length >= 2 && results.length === 0 && (
        <p className="text-neutral-500 text-sm">No results.</p>
      )}
      {!loading && q.trim().length < 2 && (
        <p className="text-neutral-500 text-sm">Type at least 2 characters.</p>
      )}
    </div>
  );
}
