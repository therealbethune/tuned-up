import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db, activities } from "@/db";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MobileTabBar } from "@/components/MobileTabBar";
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

async function unreadActivityCount(userId: string): Promise<number> {
  try {
    const [row] = await db
      .select({ n: count() })
      .from(activities)
      .where(and(eq(activities.userId, userId), isNull(activities.readAt)));
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  }
}

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
  return (
    <>
      <ThemeToggle />
      <SignInButton>
        <button className="text-neutral-300 hover:text-white">Sign in</button>
      </SignInButton>
      <SignUpButton forceRedirectUrl="/welcome">
        <button className="rounded-full bg-white text-black px-3 py-1 font-medium">Sign up</button>
      </SignUpButton>
    </>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  let synced: Awaited<ReturnType<typeof syncCurrentUser>> = null;
  if (userId) {
    try {
      synced = await syncCurrentUser();
    } catch {
      /* don't block rendering on a bad sync */
    }
  }
  const unread = await getUnreadForTabBar(userId);
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
          style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
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
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500 text-black group-hover:bg-emerald-400 transition-colors">
                  <TunedUpMark size={16} />
                </span>
                <span className="hidden sm:inline">Tuned Up</span>
              </Link>
              <div className="flex items-center gap-2 sm:gap-4 text-sm">
                {userId ? <SignedInNav userId={userId} /> : <SignedOutNav />}
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">{children}</main>
          {userId && <MobileTabBar unread={unread} />}
          {userId && <TimezoneSync serverTimezone={synced?.timezone ?? null} />}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
