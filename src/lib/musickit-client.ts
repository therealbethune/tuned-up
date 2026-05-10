// Browser-side MusicKit JS bootstrap. Shared by ConnectMusicBanner,
// SaveToAppleMusicButton, AppleMusicAccountCard, and anything else that
// touches MusicKit. The script load + token fetch + configure step is
// expensive enough to deduplicate via a module-level promise.

import type { MusicKitInstance } from "@/lib/musickit-types";
import "@/lib/musickit-types";

const MUSICKIT_JS_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

export const APPLE_MUSIC_AUTHORIZED_KEY = "tu_apple_music_authorized";

// Module-level cache so the script is loaded + configured exactly once
// per page session. Subsequent callers receive the same configured
// MusicKitInstance.
let setupPromise: Promise<MusicKitInstance> | null = null;

export async function setupMusicKit(): Promise<MusicKitInstance> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    if (!window.MusicKit) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${MUSICKIT_JS_URL}"]`);
        if (existing) {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => reject(new Error("load")), {
            once: true,
          });
          return;
        }
        const s = document.createElement("script");
        s.src = MUSICKIT_JS_URL;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("load"));
        document.head.appendChild(s);
      });
      // MusicKit dispatches "musickitloaded" after its own init.
      await new Promise<void>((resolve) => {
        if (window.MusicKit) return resolve();
        document.addEventListener("musickitloaded", () => resolve(), { once: true });
      });
    }
    if (!window.MusicKit) throw new Error("MusicKit global missing");
    const tokRes = await fetch("/api/musickit/token", { cache: "no-store" });
    if (!tokRes.ok) throw new Error("token");
    const { token } = await tokRes.json();
    await window.MusicKit.configure({
      developerToken: token,
      app: { name: "Tuned Up", build: "1.0" },
    });
    return window.MusicKit.getInstance();
  })();
  return setupPromise;
}

// Centralized read/write for the "user has connected Apple Music" flag.
export function isAppleMusicAuthorized(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(APPLE_MUSIC_AUTHORIZED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAppleMusicAuthorized(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) {
      window.localStorage.setItem(APPLE_MUSIC_AUTHORIZED_KEY, "1");
    } else {
      window.localStorage.removeItem(APPLE_MUSIC_AUTHORIZED_KEY);
    }
  } catch {
    /* localStorage blocked — silent */
  }
}

// User-facing string for an error thrown by setupMusicKit + authorize().
export function musicKitErrorMessage(e: unknown): string {
  const msg = (e as Error).message;
  if (msg === "token") return "Developer token error";
  if (msg === "load") return "MusicKit failed to load — check connection";
  if (/popup|blocked|navigator/i.test(msg)) {
    return "Popup blocked — allow popups for tuned-up.com";
  }
  return "Sign-in cancelled";
}
