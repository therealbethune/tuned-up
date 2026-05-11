import { FeedSkeleton } from "@/components/FeedSkeleton";

// Skeleton for /u/<username>. Header (avatar + name + streak chip),
// followers/following bar, then a stack of rating cards. Mirrors the
// real component dimensions so the hand-off doesn't shift layout.
export default function UserProfileLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 rounded-full bg-neutral-800 shrink-0" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-8 w-1/2 rounded bg-neutral-800" />
          <div className="flex gap-2">
            <div className="h-4 w-24 rounded bg-neutral-800/60" />
            <div className="h-4 w-20 rounded bg-orange-500/20" />
          </div>
        </div>
        <div className="h-9 w-24 rounded-full bg-neutral-800 shrink-0" />
      </div>
      <div className="h-10 border-y border-neutral-800 flex items-center gap-5 px-1">
        <div className="h-4 w-24 rounded bg-neutral-800/70" />
        <div className="h-4 w-24 rounded bg-neutral-800/70" />
        <div className="ml-auto h-4 w-16 rounded bg-neutral-800/70" />
      </div>
      <FeedSkeleton count={4} />
    </div>
  );
}
