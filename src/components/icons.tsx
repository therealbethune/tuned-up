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

// Same shape as SpotifyIcon but with a black stroke — looks right when
// placed on a green/Spotify-brand chip background.
export function SpotifyIconOnGreen({ size = 22, className, ...rest }: IconProps) {
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
        stroke="#000"
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

// --- Generic UI icons ----------------------------------------------------

export function MicIcon({ size = 14, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
      {...rest}
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
    </svg>
  );
}

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

export function ShareIcon({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export function CommentIcon({ size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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

export function HeartIcon({
  size = 18,
  filled = false,
  className,
  ...rest
}: IconProps & { filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 10, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
      className={className}
      {...rest}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
