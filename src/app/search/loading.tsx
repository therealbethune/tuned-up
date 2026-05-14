import { RowSkeleton } from "@/components/RowSkeleton";

// Skeleton shown the moment a user taps the Search tab.
export default function SearchLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <h1 className="text-2xl font-bold">Find a song</h1>
      <div className="h-12 rounded-full shimmer" />
      <div className="space-y-2">
        <RowSkeleton size={56} lines={2} count={3} />
      </div>
    </div>
  );
}
