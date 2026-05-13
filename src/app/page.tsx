import { Show, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { TunedUpMark } from "@/components/icons";

// Logged-out landing page. Until now this was a Tailwind-default
// stack with a flat <h1> + <p> — it carried zero brand. Now: an
// emerald radial-gradient hero with the wordmark sized up, the
// headline rendered as a gradient-clipped text fill, and a teaser
// "mock card" preview so visitors immediately see what they're
// signing up for.
export default function Home() {
  return (
    <div className="relative isolate">
      {/* Background glow — clips to body via the parent's overflow.
          Radial gradient stacks under everything else on the page. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,theme(colors.emerald.500/0.18),transparent_55%)]"
      />

      <div className="space-y-10 pt-8 pb-12 sm:pt-16">
        <div className="space-y-6 max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium px-3 py-1">
            <TunedUpMark size={12} />
            Tuned Up
          </span>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-[1.05] bg-gradient-to-br from-white via-white to-neutral-500 bg-clip-text text-transparent">
            Rate every song.
            <br />
            Follow your taste.
          </h1>
          <p className="text-lg text-neutral-300 max-w-md">
            Score tracks 1&ndash;100, build a profile of your taste, and see what your friends are listening to.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Show when="signed-out">
              {/* Plain string child — see comment in layout.tsx
                  SignedOutNav. Clerk wraps it in a default button;
                  the `.clerk-landing-primary` CSS rule styles it. */}
              <span className="clerk-landing-primary inline-flex">
                <SignUpButton forceRedirectUrl="/welcome">Get started</SignUpButton>
              </span>
              <Link
                href="/discover"
                className="rounded-full border border-neutral-700 px-5 py-2.5 font-medium hover:bg-neutral-900 active:scale-95 transition-transform"
              >
                See what&apos;s trending
              </Link>
            </Show>
            <Show when="signed-in">
              <Link href="/feed" className="rounded-full bg-white text-black px-5 py-2.5 font-medium active:scale-95 transition-transform">
                Open feed
              </Link>
              <Link href="/search" className="rounded-full border border-neutral-700 px-5 py-2.5 font-medium hover:bg-neutral-900 active:scale-95 transition-transform">
                Find a song
              </Link>
            </Show>
          </div>
        </div>

        {/* Teaser stack — three rotated card silhouettes that imply
            "your feed will look like this". No real data; just enough
            to set expectations and add visual weight. */}
        <Show when="signed-out">
          <div className="relative h-48 sm:h-56 max-w-md">
            <TeaserCard rotate="-rotate-3" offset="left-0 top-2"          score={92} label="Banger"   title="Chase Atlantic" artist="Like a Rockstar" />
            <TeaserCard rotate="rotate-1"  offset="left-4 top-0"          score={71} label="Solid"    title="Wet Leg"        artist="Catch These Fists" />
            <TeaserCard rotate="rotate-3"  offset="left-8 top-4"          score={88} label="Loved"    title="Phoebe Bridgers" artist="Funeral" />
          </div>
        </Show>
      </div>

      {/* Legal footer for logged-out visitors. The App Store reviewer
          lands here from the App Store Connect "Marketing URL" field,
          so the privacy + terms links must be reachable from this
          surface without signing in. Same hygiene as Settings. */}
      <footer className="pt-10 mt-4 border-t border-neutral-800/60 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
        <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
        <Link href="/legal/terms" className="hover:text-white">Terms</Link>
        <a href="mailto:support@tuned-up.com" className="hover:text-white">support@tuned-up.com</a>
      </footer>
    </div>
  );
}

function TeaserCard({
  rotate,
  offset,
  score,
  label,
  title,
  artist,
}: {
  rotate: string;
  offset: string;
  score: number;
  label: string;
  title: string;
  artist: string;
}) {
  // Static color for the teaser — we don't import scoreLabel since these
  // numbers are fake decoration, not real ratings.
  const color =
    score >= 85
      ? "text-emerald-400"
      : score >= 60
        ? "text-lime-400"
        : "text-yellow-400";
  return (
    <div
      className={`absolute w-72 sm:w-80 rounded-xl border border-neutral-800 bg-neutral-900/70 backdrop-blur p-3 shadow-xl ${rotate} ${offset}`}
    >
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded bg-gradient-to-br from-neutral-700 to-neutral-800" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{artist}</div>
          <div className="text-xs text-neutral-400 truncate">{title}</div>
        </div>
        <div className="text-right leading-tight">
          <div className={`text-2xl font-bold tabular-nums ${color}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-400">{label}</div>
        </div>
      </div>
    </div>
  );
}
