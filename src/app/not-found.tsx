import Link from "next/link";
import { TunedUpMark } from "@/components/icons";

// Branded 404. Replaces the magnifying-glass emoji + plain headline with
// the same logomark + emerald glow used on the auth/landing surfaces, so
// "page not found" feels like part of the app and not a generic Next.js
// fallback. The .tu-emerald-glow class (globals.css) adds the radial
// haze behind the content stack.
export default function NotFound() {
  return (
    <div className="tu-emerald-glow space-y-6 py-16 max-w-md mx-auto text-center">
      <div className="inline-flex h-14 w-14 rounded-2xl bg-emerald-500 text-black items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto">
        <TunedUpMark size={28} />
      </div>
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-400/80 font-semibold">
          404
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Off the chart</h1>
        <p className="text-neutral-400 text-sm">
          That page, song, or person doesn&apos;t exist — or never did.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3 pt-2">
        <Link
          href="/"
          className="rounded-full bg-white text-black px-5 py-2 font-medium active:scale-95 transition-transform"
        >
          Home
        </Link>
        <Link
          href="/search"
          className="rounded-full border border-neutral-700 px-5 py-2 font-medium hover:bg-neutral-900 active:scale-95 transition-transform"
        >
          Search
        </Link>
      </div>
    </div>
  );
}
