"use client";
import { useEffect, useRef, useState } from "react";
import { SongRow } from "@/components/SongRow";
import type { SongResult, ItemKind } from "@/lib/ytmusic";

const RECENT_KEY = "tu_recent_searches";
const RECENT_MAX = 8;

function loadRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecent(term: string) {
  if (typeof window === "undefined") return;
  const t = term.trim();
  if (t.length < 2) return;
  const list = loadRecents();
  const next = [t, ...list.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ItemKind>("song");
  const [results, setResults] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const reqId = useRef(0);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

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
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}&kind=${kind}`);
        const data = await res.json();
        if (id !== reqId.current) return;
        if (!res.ok) throw new Error(data.error || "search failed");
        setResults(data.results ?? []);
        setError(null);
        if ((data.results ?? []).length > 0) {
          saveRecent(term);
          setRecents(loadRecents());
        }
      } catch (e) {
        if (id !== reqId.current) return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  const top = results[0];
  const rest = results.slice(1);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Find {kind === "album" ? "an album" : "a song"}</h1>
        <p className="text-neutral-400 text-sm">
          Search YouTube Music. Click the artwork to open the {kind === "album" ? "album" : "track"}.
        </p>
      </div>

      <div className="inline-flex rounded-full border border-neutral-800 p-1 text-sm">
        <button
          onClick={() => setKind("song")}
          className={`px-4 py-1 rounded-full transition-colors ${
            kind === "song" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Songs
        </button>
        <button
          onClick={() => setKind("album")}
          className={`px-4 py-1 rounded-full transition-colors ${
            kind === "album" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Albums
        </button>
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
          placeholder={kind === "album" ? "Album, artist…" : "Song, artist, album…"}
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
        <div className="space-y-3">
          {recents.length > 0 ? (
            <>
              <h2 className="text-xs uppercase tracking-wider text-neutral-500">Recent searches</h2>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQ(r)}
                    className="text-xs rounded-full border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900 px-3 py-1.5 text-neutral-300"
                  >
                    {r}
                  </button>
                ))}
                <button
                  onClick={() => {
                    try { window.localStorage.removeItem(RECENT_KEY); } catch {}
                    setRecents([]);
                  }}
                  className="text-xs text-neutral-500 hover:text-red-400 px-2"
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <p className="text-neutral-500 text-sm">Type at least 2 characters to search.</p>
          )}
        </div>
      )}
    </div>
  );
}
