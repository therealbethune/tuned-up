"use client";
import { useEffect } from "react";

const STORAGE_KEY = "tu_synced_timezone";

// Run once per page load. Reads the browser's IANA timezone and POSTs it to
// the server if it differs from what we last synced (cached in localStorage
// so we don't hit the API on every navigation).
export function TimezoneSync({ serverTimezone }: { serverTimezone: string | null }) {
  useEffect(() => {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return;
    }
    if (!tz) return;

    let lastSynced = "";
    try {
      lastSynced = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      /* localStorage may be blocked */
    }

    // Already up to date with the server.
    if (serverTimezone === tz && lastSynced === tz) return;

    fetch("/api/account/timezone", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ timezone: tz }),
    })
      .then((res) => {
        // Only cache when the server actually accepted the value. The
        // previous version persisted on any response — a single failed
        // 4xx/5xx response would short-circuit every subsequent sync
        // because lastSynced === tz would match. Result: streak
        // cron fires in the wrong timezone for that user forever.
        if (res.ok) {
          try {
            localStorage.setItem(STORAGE_KEY, tz);
          } catch {}
        }
      })
      .catch(() => {});
  }, [serverTimezone]);

  return null;
}
