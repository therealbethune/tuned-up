import { FeedSkeleton } from "@/components/FeedSkeleton";

// /me skeleton — mirrors the real layout: toolbar + cover banner +
// avatar overlap + name row + 3-stat strip + ratings cards. Shimmer
// replaces the old static animate-pulse so the wait reads as active.
export default function MeLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex justify-end gap-1.5 sm:gap-2 text-sm">
        <div className="h-8 w-16 rounded-full shimmer" />
        <div className="h-8 w-16 rounded-full shimmer" />
        <div className="h-8 w-16 rounded-full shimmer" />
        <div className="h-8 w-20 rounded-full shimmer" />
      </div>
      <div>
        <div className="h-28 sm:h-32 -mx-4 sm:mx-0 sm:rounded-2xl shimmer" />
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 rounded-full shimmer ring-4 ring-neutral-950 shrink-0 -mt-10" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-7 w-2/5 rounded shimmer" />
            <div className="h-4 w-1/3 rounded shimmer" />
          </div>
        </div>
      </div>
      <div className="h-10 border-y border-neutral-800" />
      <FeedSkeleton count={3} />
    </div>
  );
}
