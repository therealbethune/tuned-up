// Skeleton tuned to the revamped /discover layout: hero spotlight at
// the top, friend-recs rail, two grid sections, and a people-to-follow
// rail. Dimensions match the real components so there's no CLS when
// the server data finally lands.
export default function DiscoverLoading() {
  return (
    <div className="space-y-8 animate-pulse" aria-busy="true">
      <div className="space-y-2">
        <div className="h-7 w-32 rounded bg-neutral-800" />
        <div className="h-4 w-2/3 rounded bg-neutral-800/60" />
      </div>

      {/* Hero spotlight */}
      <div className="rounded-2xl border border-emerald-500/30 bg-neutral-950 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6">
        <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-lg bg-neutral-800 shrink-0 mx-auto sm:mx-0" />
        <div className="flex-1 space-y-3">
          <div className="h-3 w-24 rounded bg-emerald-500/30" />
          <div className="h-8 w-3/4 rounded bg-neutral-800" />
          <div className="h-4 w-1/3 rounded bg-neutral-800/60" />
          <div className="h-12 w-20 rounded bg-neutral-800" />
        </div>
      </div>

      {/* Friend recs rail */}
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-neutral-800" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-44 rounded-xl border border-neutral-800 bg-neutral-900/60 overflow-hidden"
            >
              <div className="w-full aspect-square bg-neutral-800" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-3/4 rounded bg-neutral-800" />
                <div className="h-3 w-1/2 rounded bg-neutral-800/60" />
                <div className="h-7 w-full rounded-full bg-neutral-800 mt-2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two card grids */}
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <div className="h-4 w-40 rounded bg-neutral-800" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-neutral-800 bg-neutral-900/50 overflow-hidden"
              >
                <div className="w-full aspect-square bg-neutral-800" />
                <div className="p-3 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-neutral-800" />
                  <div className="h-3 w-1/2 rounded bg-neutral-800/60" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
