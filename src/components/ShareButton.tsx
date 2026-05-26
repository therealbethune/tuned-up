"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { encodeBase64Url } from "@/lib/encoding";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { toast } from "@/lib/toast";

// Share sheet with a preview of the OG card + an explicit "Copy link"
// vs "Share to..." split. Uses navigator.share on supported clients
// (mostly iOS / Android Capacitor) and falls back to the in-app sheet
// otherwise. The preview image is the same /api/og/rating endpoint
// the social unfurl uses, so the user knows exactly what someone
// pasting the link into iMessage will see.
export function ShareButton({
  username,
  songId,
}: {
  username: string;
  songId: string;
}) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  useScrollLock(open);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${encodeURIComponent(username)}/${encodeBase64Url(songId)}`
      : `/r/${encodeURIComponent(username)}/${encodeBase64Url(songId)}`;
  const ogUrl = `/api/og/rating?u=${encodeURIComponent(username)}&s=${encodeURIComponent(songId)}`;

  // Prop-driven modal animation. Lint rule misclassifies it.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(id);
    } else {
      setShow(false);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function close() {
    setShow(false);
    setTimeout(() => setOpen(false), 200);
  }

  async function nativeShare() {
    if (typeof navigator === "undefined" || !navigator.share) {
      setOpen(true);
      return;
    }
    try {
      await navigator.share({
        title: "Tuned Up",
        text: `Check out @${username}'s rating`,
        url,
      });
    } catch {
      setOpen(true);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Link copied.");
    } catch {
      toast.info(`Copy this link: ${url}`);
    }
  }

  return (
    <>
      <button
        onClick={nativeShare}
        className="text-sm text-neutral-400 hover:text-white inline-flex items-center gap-1.5 min-h-9 px-2 py-1.5 rounded-md active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
        title="Share rating"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
        Share
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share this rating"
          className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center transition-opacity duration-200 ${
            show ? "bg-black/65 backdrop-blur-sm" : "bg-black/0"
          }`}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-4 transform transition-transform duration-200 ease-out ${
              show ? "translate-y-0" : "translate-y-full sm:translate-y-2"
            }`}
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}
          >
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Share this rating</h2>
              <p className="text-xs text-neutral-400">
                Preview of what others will see when you paste the link.
              </p>
            </div>
            <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
              <Image
                src={ogUrl}
                alt="Share preview"
                width={600}
                height={315}
                className="w-full h-auto"
                unoptimized
                priority
              />
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-2.5">
              <code className="flex-1 text-xs text-neutral-300 truncate">{url}</code>
              <button
                onClick={copy}
                className="rounded-md bg-white text-black text-xs font-semibold px-3 py-1.5 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={close}
                className="rounded-full border border-neutral-700 hover:bg-neutral-900 text-sm px-4 py-1.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
