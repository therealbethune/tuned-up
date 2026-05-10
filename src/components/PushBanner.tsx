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

// Detect iOS Safari running OUTSIDE of an installed PWA. iOS only allows
// web push when the site has been "Add to Home Screen" + iOS 16.4+, so
// asking for permission in the regular browser tab is a dead end. We show
// a different message in that case so users aren't confused.
function isIosBrowserNotPWA(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
  if (!isIOS) return false;
  // PWA mode: matchMedia('(display-mode: standalone)') OR navigator.standalone
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

// Tiny pill above the profile that nudges users to enable push. Hidden when:
//   - browser doesn't support push at all
//   - user has already granted permission
//   - user has explicitly denied (we won't pester)
//   - user dismissed this banner before
// On iOS Safari (not installed as PWA) we show an "Add to Home Screen" hint
// instead of the regular Turn On button.
export function PushBanner() {
  const [shouldShow, setShouldShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!VAPID_PUBLIC_KEY) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* localStorage may be blocked */
    }
    // iOS-not-PWA path: we can still show the banner with a different CTA.
    if (isIosBrowserNotPWA()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIosHint(true);
      setShouldShow(true);
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "default") return;
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

  if (iosHint) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-sky-700/40 bg-sky-500/5 px-3 py-1.5 text-xs text-neutral-300">
        <span aria-hidden>📱</span>
        <span className="flex-1">
          Get push notifications: tap{" "}
          <span className="text-sky-300">Share → Add to Home Screen</span>, open from there, then enable.
        </span>
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
