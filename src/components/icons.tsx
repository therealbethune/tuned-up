// Shared icon components. Inline SVGs were previously duplicated across
// 6+ files; one source of truth here keeps them visually consistent and
// shrinks the bundle slightly.
//
// Convention:
//  - Brand icons (Spotify, YouTube Music, Apple Music) carry their own
//    fill via `fill="currentColor"` so the parent's text color drives
//    the appearance.
//  - Generic UI icons (heart, share, comment, etc.) use `stroke="currentColor"`
//    with no fill so they look right on either light or dark backgrounds.
//  - All icons accept a `size` prop (default 16) and forward `className`.

import type { SVGProps } from "react";

type IconProps = {
  size?: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, "width" | "height">;

// --- Brand icons ---------------------------------------------------------

export function SpotifyIcon({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...rest}
    >
      <circle cx="12" cy="12" r="10" />
      <path
        d="M7.5 14.4c2.4-1.4 5.7-1.7 9-.8m-9-3.6c2.9-1.6 7-2 10.5-.8m-10.5-3c3.4-1.6 8.5-1.8 12.5-.4"
        stroke="white"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function YtMusicIcon({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...rest}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M10 8.5v7l6-3.5z" fill="white" />
    </svg>
  );
}

export function AppleMusicIcon({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...rest}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path
        d="M14 7v8.2a2.3 2.3 0 1 1-1-1.9V9.5l-4 1V16a2.3 2.3 0 1 1-1-1.9V8l6-1.5z"
        fill="white"
      />
    </svg>
  );
}

// SoundCloud — abstract waveform mark. Their official logo is a
// trademark we shouldn't reproduce exactly; this is a generic
// "stacked vertical bars" rendition that reads as "audio waveform"
// without aping the licensed asset. Tinted with their brand orange
// via currentColor at the caller.
export function SoundCloudIcon({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...rest}
    >
      <rect x="2"  y="10" width="2" height="6"  rx="1" />
      <rect x="5"  y="8"  width="2" height="10" rx="1" />
      <rect x="8"  y="6"  width="2" height="14" rx="1" />
      <rect x="11" y="4"  width="2" height="16" rx="1" />
      <rect x="14" y="6"  width="2" height="14" rx="1" />
      <rect x="17" y="9"  width="2" height="8"  rx="1" />
      <rect x="20" y="11" width="2" height="4"  rx="1" />
    </svg>
  );
}

// --- Generic UI icons ----------------------------------------------------

// Triangular play glyph. Single source of truth — replaces inline
// `<path d="M8 5v14l11-7z" />` duplicates across SongRow, feed,
// and AudioPreviewButton. Inherits color via `fill="currentColor"`.
export function PlayIcon({ size = 18, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function SearchIcon({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...rest}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function PaperPlaneIcon({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="M3 11l18-8-8 18-2-8-8-2z" />
    </svg>
  );
}

// --- More generic UI icons ----------------------------------------------

export function SettingsIcon({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      {...rest}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// --- Brand mark ---------------------------------------------------------

// Tuned Up logomark. Two ascending bars + a tuning dot — reads as a
// stylized equalizer + the "tuned" pitch reference. Designed to sit
// inside an emerald-on-black rounded square at the page-header size
// (h-7 w-7) and scale cleanly down to a 16×16 favicon and up to a
// 128×128 app icon. Pure SVG, no gradients, no external fonts.
export function TunedUpMark({ size = 20, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="Tuned Up"
      className={className}
      {...rest}
    >
      {/* Three bars climbing, rightmost tallest, lowest baseline aligned. */}
      <rect x="4"  y="13" width="3.5" height="7"  rx="1.5" />
      <rect x="10.25" y="9"  width="3.5" height="11" rx="1.5" />
      <rect x="16.5" y="4"  width="3.5" height="16" rx="1.5" />
    </svg>
  );
}
