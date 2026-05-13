"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/lib/toast";
import { encodeBase64Url } from "@/lib/encoding";

// "Surprise me" — one-tap dice-roll that picks a single 75+ song the
// viewer hasn't rated, biased toward songs their friends loved. Lands
// the user on /album/<id> where the rate flow is already wired. Quick,
// rewarding, and an addictive habit-hook for users who don't know what
// to rate next.
export function SurpriseMeButton({
  className,
}: {
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/suggestions/surprise", { cache: "no-store" });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't pick a song");
        return;
      }
      const j = await res.json();
      if (!j.song) {
        toast.info("No surprises available yet. Follow more people!");
        return;
      }
      router.push(`/album/${encodeBase64Url(j.song.id)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={go}
      disabled={busy}
      aria-label="Surprise me with a song"
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-500 text-black text-sm font-semibold px-4 py-1.5 min-h-9 active:scale-95 transition-transform disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
      }
    >
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="8" cy="8" r="1.4" />
        <circle cx="16" cy="8" r="1.4" />
        <circle cx="8" cy="16" r="1.4" />
        <circle cx="16" cy="16" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
      </svg>
      {busy ? "Rolling…" : "Surprise me"}
    </button>
  );
}
