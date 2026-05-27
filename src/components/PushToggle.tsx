"use client";
import { useEffect, useState } from "react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Status =
  | "loading"
  | "unsupported"
  | "denied"
  | "off"
  | "on"
  | "saving";

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  // Allocate a fresh ArrayBuffer so its type is exactly ArrayBuffer (not
  // SharedArrayBuffer), which is what BufferSource requires.
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; ++i) view[i] = raw.charCodeAt(i);
  return view;
}

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void initialState();
    async function initialState() {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setStatus("unsupported");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        setStatus(existing && Notification.permission === "granted" ? "on" : "off");
      } catch {
        setStatus("unsupported");
      }
    }
  }, []);

  async function enable() {
    setStatus("saving");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("server refused subscription");
      setStatus("on");
      setMsg("Notifications enabled.");
    } catch (e) {
      setStatus("off");
      setMsg((e as Error).message || "Failed to enable notifications");
    }
  }

  async function disable() {
    setStatus("saving");
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        // Tell the server first, then unsubscribe locally. If we
        // unsubscribed first and the DELETE request failed, the row
        // would linger in push_subscriptions and we'd keep trying to
        // send pushes to a dead endpoint (web-push would 410, which
        // we don't currently prune — see lib/push.ts).
        const res = await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
        if (!res.ok) {
          // Server DELETE failed — don't proceed with local unsubscribe
          // OR flip the UI state. The row remains in push_subscriptions;
          // the user can retry. Surface the actual failure so they
          // don't tap "Disable" and silently still get notifications.
          throw new Error(`Couldn't disable on the server (HTTP ${res.status}).`);
        }
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg("Notifications disabled on this device.");
    } catch (e) {
      setStatus("on");
      setMsg((e as Error).message || "Failed to disable");
    }
  }

  if (status === "loading") {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (status === "unsupported") {
    return (
      <p className="text-sm text-neutral-400">
        Push notifications aren&apos;t supported in this browser.{" "}
        <span className="text-neutral-500">
          On iPhone, add Tuned Up to your home screen first (Safari &rarr; Share &rarr; Add to Home Screen),
          then re-open from there.
        </span>
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="text-sm text-neutral-400">
        Notifications are blocked. Update permissions in your browser settings to enable.
      </p>
    );
  }

  const enabled = status === "on";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <span>
          <span className="block font-medium">Push notifications</span>
          <span className="block text-sm text-neutral-400">
            New followers, likes, and comments on your ratings.
          </span>
        </span>
        {/* Switch implemented as a flex row so the knob slides via
            justify-content, not absolute+transform. The old version
            fought with the global `button:active { scale(0.97) }`
            rule because composing two transforms on the same element
            broke the knob's visible position briefly on tap. */}
        <button
          type="button"
          onClick={() => (enabled ? disable() : enable())}
          disabled={status === "saving"}
          className={`shrink-0 inline-flex items-center h-7 w-12 rounded-full p-0.5 transition-colors ${
            enabled ? "bg-emerald-500 justify-end" : "bg-neutral-700 justify-start"
          } disabled:opacity-50`}
          style={{ transform: "none" }}
          aria-label="Toggle push notifications"
          role="switch"
          aria-checked={enabled}
        >
          <span
            className="h-6 w-6 rounded-full bg-white shadow-md transition-all"
            aria-hidden
          />
        </button>
      </div>
      {msg && <p className="text-xs text-neutral-500">{msg}</p>}
    </div>
  );
}
