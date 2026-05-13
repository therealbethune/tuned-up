"use client";
import { useState } from "react";
import { COVER_THEMES, coverThemeFor } from "@/lib/cover-themes";
import { toast } from "@/lib/toast";

// Settings UI to pick the gradient theme for the profile cover banner.
// Renders the live preview on top of the picker so taps swap the
// visible banner instantly. No upload pipeline — just a curated set.
export function CoverThemePicker({ initial }: { initial: string | null }) {
  const [theme, setTheme] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const preview = coverThemeFor(theme).css;

  async function pick(id: string | null) {
    if (busy || id === theme) return;
    const prev = theme;
    setTheme(id);
    setBusy(true);
    try {
      const res = await fetch("/api/account/cover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ theme: id }),
      });
      if (!res.ok) {
        setTheme(prev);
        await toast.fromResponse(res, "Couldn't save theme");
        return;
      }
      toast.success("Profile cover updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">
        Profile cover
      </h2>
      <div className={`rounded-xl h-24 ${preview}`} aria-hidden />
      <div className="flex flex-wrap gap-2">
        {COVER_THEMES.map((t) => {
          const active = (theme ?? "emerald") === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id)}
              disabled={busy}
              aria-pressed={active}
              className={`relative h-12 w-20 rounded-lg overflow-hidden border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 ${
                active ? "border-emerald-400" : "border-neutral-800 hover:border-neutral-600"
              }`}
              title={t.label}
            >
              <span className={`block h-full w-full ${t.css}`} aria-hidden />
              <span className="absolute bottom-1 left-1 right-1 text-[10px] font-medium text-white drop-shadow text-center">
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
