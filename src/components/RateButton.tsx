"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SongResult } from "@/lib/ytmusic";

export function RateButton({ song, initialScore }: { song: SongResult; initialScore?: number | null }) {
  const router = useRouter();
  const [score, setScore] = useState<number>(initialScore ?? 50);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const res = await fetch("/api/ratings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ song, score }),
    });
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to save rating");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-white text-black px-4 py-1.5 text-sm font-medium hover:bg-neutral-200"
      >
        {initialScore ? `Rated ${initialScore}` : "Rate"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={1}
        max={100}
        value={score}
        onChange={(e) => setScore(Number(e.target.value))}
        className="w-32 accent-white"
      />
      <span className="font-mono text-sm w-9 text-right">{score}</span>
      <button
        onClick={submit}
        disabled={busy}
        className="rounded-full bg-white text-black px-3 py-1 text-sm font-medium disabled:opacity-50"
      >
        {busy ? "…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-neutral-400 hover:text-white">
        Cancel
      </button>
    </div>
  );
}
