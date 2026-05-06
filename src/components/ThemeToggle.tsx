"use client";
import { useEffect, useState } from "react";

type Mode = "light" | "dark";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* localStorage may be blocked */
    }
    setMode(next);
  }

  // Render a stable placeholder during SSR so the hydration matches; flip
  // icon after mount.
  return (
    <button
      onClick={toggle}
      className="text-neutral-300 hover:text-white p-1"
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
    >
      {mounted && mode === "light" ? (
        // Sun
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
