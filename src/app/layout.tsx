import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTabBar } from "@/components/MobileTabBar";
import { SentryUserSync } from "@/components/SentryUserSync";
import { Toaster } from "@/components/Toaster";
import { TunedUpMark } from "@/components/icons";
import { syncCurrentUser } from "@/lib/sync-user";
import { TimezoneSync } from "@/components/TimezoneSync";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.URL && !process.env.URL.includes("--")
    ? process.env.URL
    : "https://tuned-up.com");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tuned Up",
  description: "Rate songs 1–100 and follow your friends",
  applicationName: "Tuned Up",
  appleWebApp: {
    capable: true,
    title: "Tuned Up",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Runs before paint to prevent a flash of dark/light. Reads localStorage
// 'theme' override; if absent, follows the system preference.
const themeBootstrapScript = `
try {
  var t = localStorage.getItem('theme');
  var d = document.documentElement;
  if (t === 'light') d.classList.remove('dark');
  else if (t === 'dark') d.classList.add('dark');
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) d.classList.add('dark');
  else d.classList.remove('dark');
} catch (e) {}
`;

// Use the React-`cache()` version from cached-queries.ts so both the
// desktop nav badge and the mobile tab-bar badge share one DB roundtrip
// per render instead of two.
import { unreadActivityCount } from "@/lib/cached-queries";

function NavLink({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-1.5 hover:text-white text-neutral-300 px-1"
      aria-label={label}
    >
      <span className="inline-flex items-center justify-center">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 right-0 sm:-right-2 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[10px] text-black font-bold tabular-nums flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

const ICON = {
  feed: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </svg>
  ),
  discover: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  people: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  activity: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  me: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

async function SignedInNav({ userId }: { userId: string }) {
  const unread = await unreadActivityCount(userId);
  return (
    <>
      {/* Desktop: full nav. Mobile: bottom tab bar handles primary nav,
          so here we only show theme + UserButton. */}
      <span className="hidden sm:contents">
        <NavLink href="/feed" icon={ICON.feed} label="Feed" />
        <NavLink href="/discover" icon={ICON.discover} label="Discover" />
        <NavLink href="/search" icon={ICON.search} label="Search" />
        <NavLink href="/people" icon={ICON.people} label="People" />
        <NavLink href="/activity" icon={ICON.activity} label="Activity" badge={unread} />
        <NavLink href="/me" icon={ICON.me} label="Me" />
      </span>
      <ThemeToggle />
      <UserButton />
    </>
  );
}

async function getUnreadForTabBar(userId: string | null): Promise<number> {
  if (!userId) return 0;
  return unreadActivityCount(userId);
}

function SignedOutNav() {
  // Clerk 6.x's SignInButton/SignUpButton enforce React.Children.only
  // on their child. Wrapping with our own <button> got rejected as
  // "multiple children" under Turbopack/React 19 — likely a JSX
  // whitespace-handling quirk. Passing a plain string lets Clerk
  // wrap it in its default <button>, then we use a global CSS rule
  // (see globals.css) to style any button rendered inside .clerk-nav.
  return (
    <span className="clerk-nav inline-flex items-center gap-2 sm:gap-4">
      <ThemeToggle />
      <SignInButton>Sign in</SignInButton>
      <SignUpButton forceRedirectUrl="/welcome">Sign up</SignUpButton>
    </span>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  // Fan out syncCurrentUser + unread count so the layout-level data
  // doesn't add two sequential DB roundtrips to every signed-in page
  // render. They're independent — sync writes/reads the users row,
  // unread reads from activities — and both gate the layout shell.
  // syncCurrentUser is wrapped to swallow its own throws (don't block
  // rendering on a bad sync); unread defaults to 0 on failure.
  const [synced, unread] = await Promise.all([
    userId
      ? syncCurrentUser().catch(() => null)
      : Promise.resolve(null),
    getUnreadForTabBar(userId).catch(() => 0),
  ]);
  return (
    <ClerkProvider>
      <html lang="en" className="dark" suppressHydrationWarning>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          {/* iOS PWA splash screens. iOS picks the link whose media query
              matches the device exactly (or comes closest). */}
          <link rel="apple-touch-startup-image" href="/api/splash/1290/2796"
            media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/1284/2778"
            media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/1179/2556"
            media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/1170/2532"
            media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/1125/2436"
            media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/828/1792"
            media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
          <link rel="apple-touch-startup-image" href="/api/splash/750/1334"
            media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
          <Script id="theme-bootstrap" strategy="beforeInteractive">
            {themeBootstrapScript}
          </Script>
        </head>
        <body
          className="min-h-screen bg-neutral-950 text-neutral-100 antialiased sm:pb-0"
          // Tab bar is ~56px + the iPhone home-indicator safe-area. The
          // previous pb-20 (80px) wasn't enough on iPhone 15 to keep
          // the last item in a long thread visible above the bar.
          style={{
            paddingBottom: "calc(5rem + env(safe-area-inset-bottom))",
            // Landscape iPhones (Pro / Pro Max) clip body content into
            // the notch / home-bar without these. Vertical insets are
            // already handled by the header (top) and tab bar (bottom).
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
        >
          <header
            className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur sticky top-0 z-10"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <nav className="mx-auto max-w-3xl flex items-center justify-between px-3 py-3 gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 font-bold text-lg tracking-tight whitespace-nowrap group"
                aria-label="Tuned Up — home"
              >
                {/* Logomark with a soft emerald glow so the brand pops
                    against the otherwise dark header. The glow doubles as
                    a subtle group-hover halo. The wordmark stays visible
                    on every breakpoint (previously hidden under sm:),
                    because at mobile widths the lone glyph reads as a
                    decorative bullet rather than a clickable home link. */}
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-black ring-1 ring-emerald-300/40 shadow-[0_0_18px_-4px_rgba(16,185,129,0.55)] group-hover:bg-emerald-400 group-hover:shadow-[0_0_24px_-2px_rgba(16,185,129,0.75)] transition-all">
                  <TunedUpMark size={16} />
                </span>
                <span>Tuned Up</span>
              </Link>
              <div className="flex items-center gap-2 sm:gap-4 text-sm">
                {userId ? <SignedInNav userId={userId} /> : <SignedOutNav />}
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
          {userId && <MobileTabBar unread={unread} />}
          {userId && <TimezoneSync serverTimezone={synced?.timezone ?? null} />}
          {/* Tags Sentry events with the signed-in user id so we can
              answer "which user hit this?" from the issue page. No-op
              when signed out. PII stays out — see component for why. */}
          <SentryUserSync />
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
