import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-6 py-12 max-w-md mx-auto text-center">
      <div className="text-5xl">🔎</div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Not found</h1>
        <p className="text-neutral-400 text-sm">
          That page (or that user, or that song) doesn&apos;t exist.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-white text-black px-5 py-2 font-medium"
        >
          Home
        </Link>
        <Link
          href="/search"
          className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900"
        >
          Search
        </Link>
      </div>
    </div>
  );
}
