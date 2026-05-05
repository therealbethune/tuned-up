"use client";
import { useState } from "react";
import { SongRow } from "@/components/SongRow";
import type { SongResult } from "@/lib/ytmusic";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setResults(data.results ?? []);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Find a song</h1>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search YouTube Music…"
          className="flex-1 rounded-full bg-neutral-900 border border-neutral-800 px-4 py-2 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
        />
        <button className="rounded-full bg-white text-black px-4 py-2 font-medium" disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </form>
      <div className="space-y-2">
        {results.map((s) => (
          <SongRow key={s.id} song={s} />
        ))}
        {!loading && results.length === 0 && q && <p className="text-neutral-500 text-sm">No results.</p>}
      </div>
    </div>
  );
}
