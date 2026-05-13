import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { TasteTwin } from "@/lib/taste";

// "Taste twins" rail — top 3 users with highest taste-overlap %.
// Renders on /me below the profile header. Hidden when too few are
// found (e.g. the viewer hasn't rated enough songs to compute
// overlap with anyone). This is a quiet stickiness driver: every
// new rating subtly re-shuffles who counts as a twin, so it's worth
// coming back to see who else lines up with your taste.
export function TasteTwinsPanel({ twins }: { twins: TasteTwin[] }) {
  if (twins.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Taste twins</h2>
        <p className="text-xs text-neutral-500">Closest agreement with your ratings</p>
      </div>
      <ul className="space-y-2">
        {twins.map((t) => (
          <li key={t.id}>
            <Link
              href={`/u/${t.username}`}
              className="flex items-center gap-3 rounded-lg border border-neutral-800/60 bg-neutral-950 hover:bg-neutral-900 hover:border-neutral-700 transition-colors p-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
            >
              <Avatar
                imageUrl={t.imageUrl}
                name={t.displayName || t.username}
                seed={t.id}
                size={36}
                ring={false}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{t.displayName || t.username}</div>
                <div className="text-xs text-neutral-500 truncate">@{t.username}</div>
              </div>
              <div className="text-right shrink-0 leading-tight">
                <div className="text-lg font-bold tabular-nums text-emerald-400">
                  {t.agreement}%
                </div>
                <div className="text-[10px] text-neutral-500 tabular-nums">
                  {t.shared} shared
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
