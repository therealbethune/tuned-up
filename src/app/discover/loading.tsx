export default function DiscoverLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <div className="h-8 w-32 rounded bg-neutral-800" />
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s} className="space-y-3">
            <div className="h-4 w-40 rounded bg-neutral-800/70" />
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 space-y-2">
                  <div className="aspect-square rounded bg-neutral-800" />
                  <div className="h-3 w-3/4 rounded bg-neutral-800" />
                  <div className="h-3 w-1/2 rounded bg-neutral-800/60" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
