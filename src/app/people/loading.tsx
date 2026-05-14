import { RowSkeleton } from "@/components/RowSkeleton";

// Skeleton shown the moment a user taps the People tab. Mirrors the
// real /people rhythm: heading + search input shell + a few row
// placeholders so the shell doesn't jolt when results land.
export default function PeopleLoading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold">Find people</h1>
        <p className="text-neutral-400 text-sm">
          Search by username or name, or follow people Tuned Up thinks share your taste.
        </p>
      </div>
      <div className="h-12 rounded-full shimmer" />
      <div className="space-y-2">
        <RowSkeleton size={44} lines={2} count={4} />
      </div>
    </div>
  );
}
