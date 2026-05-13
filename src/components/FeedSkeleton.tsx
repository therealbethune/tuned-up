// Card-shaped skeleton for /feed loading state. Mirrors the actual
// rating-card geometry (avatar + name row, thumbnail + title + score,
// review block) so the layout doesn't reflow when real data lands.
// Uses .shimmer from globals.css for the moving highlight — beats
// the old static animate-pulse aesthetically.
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-2.5 sm:space-y-3" aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 sm:p-4"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="h-7 w-7 rounded-full shimmer" />
            <div className="h-3 w-24 rounded shimmer" />
            <div className="h-3 w-12 rounded shimmer ml-auto" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded shimmer shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-3/5 rounded shimmer" />
              <div className="h-3 w-2/5 rounded shimmer" />
            </div>
            <div className="h-8 w-12 rounded shimmer" />
          </div>
        </li>
      ))}
    </ul>
  );
}
