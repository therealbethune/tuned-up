// Unified loading spinner. Replaces the ~6 inline
// "h-4 w-4 rounded-full border-2 border-neutral-600 border-t-white"
// duplicates that drifted apart in size and color. One source of
// truth so the loading rhythm reads consistently across the app.
//
// Three sizes match the touch-target tiers: 14px for inline button
// indicators, 18px for inputs, 24px for page-level "fetching".

export function Spinner({
  size = 18,
  className,
}: {
  size?: 14 | 18 | 24;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-2 border-neutral-700 border-t-neutral-100 animate-spin ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
