import { RowSkeleton } from "@/components/RowSkeleton";

// Skeleton shown the moment a user taps the Activity tab. Mirrors the
// real /activity rhythm (header + a list of avatar-row entries) so the
// shell doesn't reflow when the data lands.
export default function ActivityLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <h1 className="text-2xl font-bold">Activity</h1>
      <div className="space-y-3">
        <RowSkeleton size={36} lines={2} count={6} />
      </div>
    </div>
  );
}
