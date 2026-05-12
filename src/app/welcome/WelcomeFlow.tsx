"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SongResult } from "@/lib/ytmusic";
import { SongRow } from "@/components/SongRow";
import { Avatar } from "@/components/Avatar";
import { toast } from "@/lib/toast";
import { SpotifyIconOnGreen } from "@/components/icons";

type SuggestedUser = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
};

export function WelcomeFlow({ suggested }: { suggested: SuggestedUser[] }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [ratingsDone, setRatingsDone] = useState(0);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [finishing, setFinishing] = useState(false);

  // Search state for step 1
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (id !== reqId.current) return;
        setResults(data.results ?? []);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Track when a rating is saved by listening for window events from RateButton.
  // RateButton calls router.refresh() after save — which is fine; we also
  // increment a local counter via custom event below.
  useEffect(() => {
    function onSaved() {
      setRatingsDone((n) => n + 1);
    }
    window.addEventListener("song-rated", onSaved);
    return () => window.removeEventListener("song-rated", onSaved);
  }, []);

  async function toggleFollow(username: string) {
    const isFollowing = following.has(username);
    setFollowing((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(username);
      else next.add(username);
      return next;
    });
    try {
      await fetch("/api/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, action: isFollowing ? "unfollow" : "follow" }),
      });
    } catch {
      // Roll back on failure
      setFollowing((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(username);
        else next.delete(username);
        return next;
      });
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      const res = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!res.ok) {
        // If the write failed, don't redirect — /feed will just
        // bounce them back to /welcome because onboardedAt is still
        // null, and we'd be in an infinite loop until they refresh.
        await toast.fromResponse(res, "Couldn't finish setup");
        setFinishing(false);
        return;
      }
    } catch (e) {
      toast.error((e as Error).message || "Network error finishing setup");
      setFinishing(false);
      return;
    }
    router.replace("/feed");
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-neutral-500">
          Step {step} of 2
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          {step === 1 ? "Rate a few songs" : "Find your friends"}
        </h1>
        <p className="text-neutral-400">
          {step === 1
            ? "Search and rate at least one song to seed your taste."
            : "Follow a few people so your feed isn't empty."}
        </p>
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-700/40 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-500 text-black inline-flex items-center justify-center shrink-0">
                <SpotifyIconOnGreen size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">Connect Spotify</div>
                <p className="text-sm text-neutral-400 mt-0.5">
                  Save songs to your Liked Songs as you rate them. You can also import your top tracks in seconds.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href="/api/spotify/connect?return=/welcome"
                className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-4 py-1.5 text-sm whitespace-nowrap active:scale-95 transition-transform"
              >
                Connect Spotify
              </a>
              <a
                href="/import/spotify"
                className="text-sm text-neutral-400 hover:text-white"
              >
                Import top tracks →
              </a>
            </div>
          </div>

          <div className="relative">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
              width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search YouTube Music…"
              className="w-full rounded-full bg-neutral-900 border border-neutral-800 pl-11 pr-12 py-2.5 placeholder:text-neutral-500 focus:outline-none focus:border-neutral-600"
            />
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 rounded-full border-2 border-neutral-600 border-t-white animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            {results.map((s) => (
              <SongRow key={s.id} song={s} />
            ))}
            {!searching && q.trim().length >= 2 && results.length === 0 && (
              <p className="text-neutral-500 text-sm">No results.</p>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
            <p className="text-sm text-neutral-400">
              {ratingsDone === 0 ? "Rate a song to continue." : `${ratingsDone} rated · keep going or move on`}
            </p>
            <button
              onClick={() => setStep(2)}
              disabled={ratingsDone === 0}
              className="rounded-full bg-white text-black px-4 py-1.5 font-medium disabled:opacity-50 active:scale-95 transition-transform"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {suggested.length === 0 ? (
            <p className="text-neutral-400">No one to suggest yet — you might be the first one here. That&apos;s fine.</p>
          ) : (
            <ul className="space-y-2">
              {suggested.map((u) => {
                const isFollowing = following.has(u.username);
                return (
                  <li
                    key={u.id}
                    className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3"
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
                      <div className="text-sm text-neutral-400 truncate">
                        @{u.username} · {u.ratingsCount} {u.ratingsCount === 1 ? "rating" : "ratings"}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleFollow(u.username)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                        isFollowing
                          ? "border border-neutral-700 text-neutral-200 hover:bg-neutral-900"
                          : "bg-white text-black hover:bg-neutral-200"
                      }`}
                    >
                      {isFollowing ? "Following" : "Follow"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
            <button onClick={() => setStep(1)} className="text-sm text-neutral-400 hover:text-white">
              ← Back
            </button>
            <div className="flex gap-3 items-center">
              <p className="text-sm text-neutral-500">
                {following.size > 0 ? `Following ${following.size}` : "Skip if you want"}
              </p>
              <button
                onClick={finish}
                disabled={finishing}
                className="rounded-full bg-white text-black px-5 py-2 font-medium disabled:opacity-50 active:scale-95 transition-transform"
              >
                {finishing ? "…" : "Finish"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
