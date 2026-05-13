"use client";
import { useState } from "react";
import { toast } from "@/lib/toast";

type Prefs = {
  mentions: boolean;
  comments: boolean;
  likes: boolean;
  follows: boolean;
  recs: boolean;
  taste_matches: boolean;
  streak: boolean;
};

const ROWS: { key: keyof Prefs; label: string; sublabel: string }[] = [
  { key: "comments", label: "Comments", sublabel: "When someone comments on your rating" },
  { key: "mentions", label: "Mentions", sublabel: "When someone @mentions you" },
  { key: "likes", label: "Likes", sublabel: "When someone likes one of your ratings" },
  { key: "follows", label: "New followers", sublabel: "When someone follows you (or asks to)" },
  { key: "recs", label: "Recommendations", sublabel: "Songs recommended to you + rec-rated responses" },
  { key: "taste_matches", label: "Taste matches", sublabel: "You and a friend both rated something 85+" },
  { key: "streak", label: "Streak reminders", sublabel: "About-to-break + milestone unlocks" },
];

// Settings UI for per-category push opt-outs. Activity rows still get
// generated server-side regardless — toggles only affect whether the
// push notification fires. Saves are incremental: each toggle posts
// only its single key so we don't fight with optimistic state in the
// other rows.
export function NotifySettings({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [busy, setBusy] = useState<keyof Prefs | null>(null);

  async function toggle(key: keyof Prefs) {
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: !prev }));
    setBusy(key);
    try {
      const res = await fetch("/api/account/notify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: !prev }),
      });
      if (!res.ok) {
        setPrefs((p) => ({ ...p, [key]: prev }));
        await toast.fromResponse(res, "Couldn't save preference");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">
        Push notifications
      </h2>
      <ul className="rounded-lg border border-neutral-800 bg-neutral-950 divide-y divide-neutral-800/80">
        {ROWS.map((row) => {
          const on = prefs[row.key];
          return (
            <li key={row.key} className="flex items-center gap-4 py-3.5 px-3 min-h-14">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-xs text-neutral-400">{row.sublabel}</div>
              </div>
              <button
                role="switch"
                aria-checked={on}
                aria-label={`${row.label} notifications`}
                disabled={busy === row.key}
                onClick={() => toggle(row.key)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
                  on ? "bg-emerald-500" : "bg-neutral-700"
                } disabled:opacity-50`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    on ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-neutral-500">
        Activity bell entries still show up regardless — these toggles only control phone-buzzing pushes.
      </p>
    </section>
  );
}
