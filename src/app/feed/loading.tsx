import { FeedSkeleton } from "@/components/FeedSkeleton";

export default function FeedLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Feed</h1>
      </div>
      <FeedSkeleton count={4} />
    </div>
  );
}
