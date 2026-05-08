"use client";
import { useState } from "react";

function encodeSongIdForUrl(songId: string): string {
  // Browser-safe url-safe base64.
  return btoa(unescape(encodeURIComponent(songId)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function ShareButton({
  username,
  songId,
}: {
  username: string;
  songId: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/r/${encodeURIComponent(username)}/${encodeSongIdForUrl(songId)}`;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
    } catch {
      /* user cancelled */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button
      onClick={share}
      className="text-sm text-neutral-400 hover:text-white inline-flex items-center gap-1.5 -my-1 px-1.5 py-1 rounded-md active:scale-95 transition-transform"
      title="Share rating"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </svg>
      {copied ? "Link copied!" : "Share"}
    </button>
  );
}
