// Generic loading skeleton for "avatar + two lines of text" rows.
// Used by CommentSection, LikersSheet, RateButton's friend-ratings
// list — anywhere a small list of users-with-context is fetched
// after the parent surface has already rendered.
//
// One source of truth so the loading rhythm matches across surfaces
// (same avatar diameter, same pulse timing).

export function RowSkeleton({
  size = 28,
  lines = 2,
  count = 2,
}: {
  size?: number;
  lines?: 1 | 2;
  count?: number;
}) {
  return (
    <ul className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-2.5">
          <span
            className="rounded-full bg-neutral-800 shrink-0"
            style={{ width: size, height: size }}
            aria-hidden
          />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-2/5 rounded bg-neutral-800" />
            {lines === 2 && (
              <div className="h-2 w-1/3 rounded bg-neutral-800/60" />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
