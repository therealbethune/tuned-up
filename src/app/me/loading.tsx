import { FeedSkeleton } from "@/components/FeedSkeleton";

export default function MeLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true">
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 rounded-full bg-neutral-800 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-8 w-1/2 rounded bg-neutral-800" />
          <div className="h-4 w-1/3 rounded bg-neutral-800/60" />
        </div>
      </div>
      <div className="h-10 border-y border-neutral-800" />
      <FeedSkeleton count={3} />
    </div>
  );
}
