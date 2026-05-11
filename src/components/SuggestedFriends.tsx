"use client";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import Link from "next/link";
import { toast } from "@/lib/toast";

type Suggestion = {
  id: string;
  username: string;
  displayName: string | null;
  imageUrl: string | null;
  ratingsCount: number;
  mutualFollowers: number;
  mutualSampleNames: string[];
  reason: string;
};

export function SuggestedFriends({ initial }: { initial?: Suggestion[] }) {
  const [items, setItems] = useState<Suggestion[] | null>(initial ?? null);
  const [loading, setLoading] = useState(initial == null);
  const [actingId, setActingId] = useState<string | null>(null);

  // Lazy-load if no initial data was passed.
  useEffect(() => {
    if (initial != null) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/users/suggestions?limit=20")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.suggestions ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial]);

  // Removes a card and triggers a slight reflow animation.
  function removeOne(id: string) {
    setItems((prev) => (prev ?? []).filter((s) => s.id !== id));
  }

  async function follow(s: Suggestion) {
    setActingId(s.id);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: s.username, action: "follow" }),
      });
      if (!res.ok) {
        // Don't remove the card on failure — the user can see it's
        // still there and try again. Toast surfaces the reason (incl.
        // 429 rate-limit) so the no-op isn't confusing.
        await toast.fromResponse(res, "Couldn't follow");
        return;
      }
      const j = await res.json().catch(() => ({}));
      toast.success(
        j.status === "pending"
          ? `Follow request sent to @${s.username}`
          : `Now following @${s.username}`,
      );
      removeOne(s.id);
    } finally {
      setActingId(null);
    }
  }

  async function dismiss(s: Suggestion) {
    setActingId(s.id);
    try {
      const res = await fetch("/api/users/suggestions/dismiss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: s.username }),
      });
      if (!res.ok) {
        await toast.fromResponse(res, "Couldn't dismiss");
        return;
      }
      removeOne(s.id);
    } finally {
      setActingId(null);
    }
  }

  if (loading && (items == null || items.length === 0)) {
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Suggested for you</h2>
        <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-44 h-56 rounded-lg border border-neutral-800 bg-neutral-900/40 animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Suggested for you</h2>
        <Link href="/people" className="text-xs text-neutral-400 hover:text-white">
          See all
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 snap-x snap-mandatory">
        {items.map((s) => {
          const busy = actingId === s.id;
          return (
            <div
              key={s.id}
              className={`relative shrink-0 w-44 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 snap-start transition-opacity duration-150 ${
                busy ? "opacity-50" : ""
              }`}
            >
              <button
                onClick={() => dismiss(s)}
                disabled={busy}
                aria-label={`Dismiss ${s.displayName || s.username}`}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-neutral-900/80 hover:bg-neutral-800 text-neutral-400 hover:text-white inline-flex items-center justify-center text-sm leading-none"
              >
                ×
              </button>
              <Link href={`/u/${s.username}`} className="block">
                <div className="flex justify-center">
                  <Avatar
                    imageUrl={s.imageUrl}
                    name={s.displayName || s.username}
                    seed={s.id}
                    size={64}
                  />
                </div>
                <div className="mt-2 text-center">
                  <div className="font-medium truncate">{s.displayName || s.username}</div>
                  <div className="text-xs text-neutral-400 truncate">@{s.username}</div>
                </div>
                <p className="mt-1.5 text-[11px] text-neutral-500 text-center line-clamp-2 min-h-[28px]">
                  {s.reason}
                </p>
              </Link>
              <button
                onClick={() => follow(s)}
                disabled={busy}
                className="mt-2 w-full rounded-full bg-white text-black px-3 py-1.5 text-xs font-semibold hover:bg-neutral-200 disabled:opacity-50"
              >
                Follow
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
