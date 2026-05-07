"use client";
import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const DISMISS_KEY = "tu_push_banner_dismissed";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) view[i] = raw.charCodeAt(i);
  return view;
}

// Tiny pill above the profile that nudges users to enable push. Hidden when:
//   - browser doesn't support push at all
//   - user has already granted permission
//   - user has explicitly denied (we won't pester)
//   - user dismissed this banner before
export function PushBanner() {
  const [shouldShow, setShouldShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }
    if (!VAPID_PUBLIC_KEY) return;
    if (Notification.permission !== "default") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* localStorage may be blocked */
    }
    setShouldShow(true);
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        // Whatever the answer, stop nagging.
        try {
          localStorage.setItem(DISMISS_KEY, "1");
        } catch {}
        setShouldShow(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setShouldShow(false);
    } catch {
      // Don't show an alert; the banner is supposed to be unobtrusive.
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {}
      setShouldShow(false);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setShouldShow(false);
  }

  if (!shouldShow) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-500/5 px-3 py-1.5 text-xs text-neutral-300">
      <span aria-hidden>🔔</span>
      <span className="flex-1 truncate">
        Get notified when friends interact with you.
      </span>
      <button
        onClick={enable}
        disabled={busy}
        className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-2.5 py-0.5 disabled:opacity-50"
      >
        {busy ? "…" : "Turn on"}
      </button>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="text-neutral-500 hover:text-white px-1"
      >
        ×
      </button>
    </div>
  );
}
