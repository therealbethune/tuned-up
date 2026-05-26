"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Thin emerald progress bar that flashes across the top of the screen
// during route transitions. The Next.js App Router doesn't natively
// signal navigation start/end the way page-router did, so we listen
// for two things:
//   1. Clicks on any anchor with an internal href — that's the moment
//      the user committed to a navigation; we flip the bar visible.
//   2. The pathname changing — that's the moment the new page is
//      ready to render; we fade the bar out.
//
// Result: between the tap and the new page becoming interactive the
// user sees a bar slide across the top, which makes a 600ms
// server-render feel like a deliberate state change instead of a
// frozen UI. Same trick every iOS/Android nav-bar uses.

export function RouteProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);

  // Reset to "done" whenever the pathname actually changes — the new
  // page has hydrated. We fade out by sliding the bar past 100% and
  // hiding it; setProgress(0) on a delay resets state for next nav.
  // setState-in-effect is the right pattern here: we react to a route
  // change (an external signal) by advancing animation state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (progress > 0) {
      setProgress(100);
      const t = setTimeout(() => setProgress(0), 240);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Listen for navigation-initiating clicks anywhere in the document.
  // We match same-origin internal links and ignore: cmd-click,
  // middle-click, target=_blank, downloads, anchors.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return; // only primary click
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Skip new-tab, external, mailto, tel, anchor jumps.
      if (target.target === "_blank") return;
      if (target.hasAttribute("download")) return;
      if (
        href.startsWith("http") ||
        href.startsWith("//") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#")
      ) {
        return;
      }
      // Already on this path → no nav happening, skip.
      try {
        const url = new URL(target.href, window.location.origin);
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
      } catch {
        return;
      }
      // Start the indeterminate progress: 0 → 30 → 70 (slows down to
      // suggest "still working"). The real completion fires when the
      // pathname change triggers the effect above.
      setProgress(30);
      requestAnimationFrame(() => {
        setProgress(70);
      });
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (progress === 0) return null;

  return (
    <div
      aria-hidden
      className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-emerald-500/15 pointer-events-none"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className="h-full bg-emerald-400 shadow-[0_0_12px_rgb(16_185_129/0.6)] transition-all"
        style={{
          width: `${progress}%`,
          transitionDuration: progress === 100 ? "200ms" : "600ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}
