"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TAB_ICON = {
  feed: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </svg>
  ),
  discover: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  search: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  people: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  activity: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  me: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

const TABS = [
  { href: "/feed", label: "Feed", icon: TAB_ICON.feed },
  { href: "/discover", label: "Discover", icon: TAB_ICON.discover },
  { href: "/search", label: "Search", icon: TAB_ICON.search },
  { href: "/people", label: "People", icon: TAB_ICON.people },
  { href: "/activity", label: "Activity", icon: TAB_ICON.activity, hasUnread: true },
  { href: "/me", label: "Me", icon: TAB_ICON.me },
];

export function MobileTabBar({ unread }: { unread: number }) {
  const pathname = usePathname() ?? "";
  // Hide the tab bar when the iOS software keyboard is up — otherwise
  // it floats on top of inputs (comment composer, search box, etc.).
  // visualViewport.height shrinks when the keyboard slides in; we
  // detect any meaningful gap vs the layout viewport and hide.
  const kbOpen = useKeyboardOpen();

  return (
    <nav
      className={`sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur transition-transform duration-150 ${
        kbOpen ? "translate-y-full pointer-events-none" : "translate-y-0"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
      aria-hidden={kbOpen}
    >
      <ul className="flex items-stretch justify-around">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center py-2 gap-1 min-h-[60px] relative transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white/50 ${
                  active ? "text-emerald-400" : "text-neutral-400 active:text-white"
                }`}
              >
                {/* Improvement #39: active indicator is wider + softer
                    so it reads as a confident "you are here" badge,
                    not a thin hairline. The icon pill swells to h-10 w-10
                    so the tap target lands above 40pt regardless of icon
                    size; the label sits below at text-[11px] for legibility. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-10 rounded-b-full bg-emerald-400 shadow-[0_2px_8px_rgb(16_185_129/0.55)]"
                  />
                )}
                <span
                  className={`relative inline-flex items-center justify-center rounded-full transition-all ${
                    active
                      ? "bg-emerald-500/15 ring-1 ring-emerald-500/40 h-10 w-10"
                      : "h-9 w-9"
                  }`}
                >
                  {t.icon}
                  {t.hasUnread && unread > 0 && (
                    <span className="absolute -top-1 -right-2 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[10px] text-black font-bold tabular-nums flex items-center justify-center">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                <span className="text-[11px] leading-none font-medium">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Detect whether the iOS software keyboard is currently up by comparing
// visualViewport.height to the layout viewport. The visualViewport API
// is the only reliable way to know — `resize` on window doesn't fire
// for keyboard transitions on iOS Safari.
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = (typeof window !== "undefined"
      ? window.visualViewport
      : null);
    if (!vv) return;
    function check() {
      // Keyboard is considered "up" if the visual viewport is meaningfully
      // shorter than the layout viewport. 150px threshold avoids false
      // positives from URL-bar collapse.
      setOpen(window.innerHeight - vv!.height > 150);
    }
    check();
    vv.addEventListener("resize", check);
    vv.addEventListener("scroll", check);
    return () => {
      vv.removeEventListener("resize", check);
      vv.removeEventListener("scroll", check);
    };
  }, []);
  return open;
}
