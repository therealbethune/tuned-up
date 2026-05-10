// Pulsing placeholder cards that mimic the feed layout so navigation
// feels instant while the server-rendered page hydrates.
export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="h-7 w-7 rounded-full bg-neutral-800" />
            <div className="h-3 w-24 rounded bg-neutral-800" />
            <div className="h-3 w-12 rounded bg-neutral-800/60 ml-auto" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded bg-neutral-800 shrink-0" />
            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-4 w-3/5 rounded bg-neutral-800" />
              <div className="h-3 w-2/5 rounded bg-neutral-800/60" />
            </div>
            <div className="h-8 w-12 rounded bg-neutral-800" />
          </div>
        </li>
      ))}
    </ul>
  );
}
