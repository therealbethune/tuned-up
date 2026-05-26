"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SongRow } from "@/components/SongRow";
import type { SongResult, ItemKind } from "@/lib/ytmusic";
import { SearchIcon } from "@/components/icons";

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

  // Read recents from localStorage on mount — has to happen after
  // hydration since localStorage isn't available on the server. Pattern
  // is intentional and re-runs zero times after first paint.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecents(loadRecents());
  }, []);

  // Debounced search effect. See same explanation in /people/page.tsx.
  /* eslint-disable react-hooks/set-state-in-effect */
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
    // AbortController cancels stale inflight bytes when the user keeps
    // typing — saves bandwidth and CPU vs just dropping the result via
    // the reqId check after parsing.
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}&kind=${kind}`,
          { signal: ac.signal },
        );
        if (id !== reqId.current) return;
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
        // AbortError fires from ac.abort() — that's the cancel path, not a
        // real error; the new request will land its own setResults shortly.
        if ((e as { name?: string })?.name === "AbortError") return;
        if (id !== reqId.current) return;
        setError((e as Error).message);
        setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, kind]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

      <div
        role="tablist"
        aria-label="Search type"
        className="inline-flex rounded-full border border-neutral-800 p-1 text-sm"
      >
        <button
          role="tab"
          aria-selected={kind === "song"}
          onClick={() => setKind("song")}
          className={`px-4 py-1.5 rounded-full transition-colors active:scale-95 ${
            kind === "song" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Songs
        </button>
        <button
          role="tab"
          aria-selected={kind === "album"}
          onClick={() => setKind("album")}
          className={`px-4 py-1.5 rounded-full transition-colors active:scale-95 ${
            kind === "album" ? "bg-white text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Albums
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400">
          <SearchIcon size={16} />
        </span>
        <input
          autoFocus
          type="search"
          aria-label={kind === "album" ? "Search albums" : "Search songs"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === "album" ? "Album, artist…" : "Song, artist, album…"}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
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
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-300">
          <p>No matches for <span className="text-white font-medium">&ldquo;{q.trim()}&rdquo;</span>.</p>
          <p className="text-neutral-400 text-xs mt-1">Try a different spelling, or include the artist name.</p>
        </div>
      )}
      {!loading && q.trim().length < 2 && (
        <div className="space-y-4">
          {recents.length > 0 ? (
            <div className="space-y-3">
              <h2 className="text-xs uppercase tracking-wider text-neutral-400">Recent searches</h2>
              <div className="flex flex-wrap gap-2">
                {recents.map((r) => (
                  <button
                    key={r}
                    onClick={() => setQ(r)}
                    className="text-xs rounded-full border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900 px-3 py-1.5 text-neutral-300 active:scale-95 transition-transform"
                  >
                    {r}
                  </button>
                ))}
                <button
                  onClick={() => {
                    try { window.localStorage.removeItem(RECENT_KEY); } catch {}
                    setRecents([]);
                  }}
                  className="text-xs text-neutral-400 hover:text-red-400 px-2"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            // First-visit state. Rather than a flat "type 2+ chars",
            // suggest a few seed searches and surface a Discover CTA
            // so the user has somewhere to go even before typing.
            <div className="space-y-4">
              <div className="space-y-2">
                <h2 className="text-xs uppercase tracking-wider text-neutral-400">Try one of these</h2>
                <div className="flex flex-wrap gap-2">
                  {["Phoebe Bridgers", "Kendrick Lamar", "Wet Leg", "Mitski", "Tyler the Creator", "Charli XCX"].map((seed) => (
                    <button
                      key={seed}
                      onClick={() => setQ(seed)}
                      className="text-xs rounded-full border border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900 px-3 py-1.5 text-neutral-300 active:scale-95 transition-transform"
                    >
                      {seed}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                Or browse what people are rating on <Link href="/discover" className="underline text-white">Discover</Link>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
