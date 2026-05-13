"use client";
import { useEffect, useState } from "react";

const TOUR_KEY = "tu_feed_tour_seen_v1";

// Three-step tooltip tour shown the very first time the user lands on
// /feed. Dismissible at any step. Storage key is bumped on each
// schema change so a redesigned tour can re-trigger across users.
//
// Why client component on mount: feed needs to render the tour ONLY
// the first time. SSR can't read localStorage, so we render a hidden
// container on the server and reveal in an effect after hydration.

const STEPS = [
  {
    title: "Today's pick",
    body: "Every day at midnight UTC we pin a popular song here. Rate it to keep your streak alive without thinking.",
  },
  {
    title: "Surprise me",
    body: "Tap to roll a random song your friends loved. It opens its rating page — one tap and you can score.",
  },
  {
    title: "After you rate",
    body: "You'll see three similar songs people who agreed with you also liked. Chain through them to find your next favorite.",
  },
];

export function FirstFeedTour() {
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(TOUR_KEY) === "1") return;
      // Defer one frame so the tour appears AFTER /feed's hero
      // skeleton resolves — feels less like a popup blocker, more
      // like a friendly intro.
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    } catch {
      /* localStorage blocked — skip the tour entirely. */
    }
  }, []);

  if (!shown) return null;

  function dismiss(persist: boolean) {
    setShown(false);
    if (persist) {
      try {
        window.localStorage.setItem(TOUR_KEY, "1");
      } catch {}
    }
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Feed tour"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss(true);
      }}
    >
      <div
        className="w-full sm:max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-5 space-y-4 shadow-2xl"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
      >
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-emerald-400" : "w-3 bg-neutral-700"
              }`}
            />
          ))}
        </div>
        <div>
          <h2 className="text-lg font-bold">{current.title}</h2>
          <p className="text-sm text-neutral-300 mt-1">{current.body}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => dismiss(true)}
            className="text-xs text-neutral-500 hover:text-white px-2 py-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
          >
            Skip
          </button>
          <button
            onClick={() => {
              if (isLast) dismiss(true);
              else setStep((s) => s + 1);
            }}
            className="rounded-full bg-white text-black text-sm font-medium px-4 py-1.5 min-h-9 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
          >
            {isLast ? "Got it" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
