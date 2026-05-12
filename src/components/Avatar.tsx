import Image from "next/image";

// Shared avatar primitive. Renders the user's image when present, else
// falls back to a colored-initial circle. The color is deterministic
// from `seed` (user id or username) so the same person always gets the
// same color — feels stable across pages and matches the Slack/Notion
// pattern users are used to.
//
// Why a shared component? Before this we had ~6 ad-hoc avatar renders
// scattered across feed, profile, comments, etc., each with a different
// fallback. Many of them showed Clerk's generic silhouette image (the
// auto-generated default that ships with every Clerk account whether
// or not the user uploaded a real photo). Routing every avatar through
// this component gives us one place to detect those defaults and route
// them through our prettier initial fallback.

// Tailwind-safe palette. Each entry has matching bg + text colors that
// read at small sizes against a dark page. Keep them visually distinct
// — same hue twice means two users would look identical.
const PALETTE: { bg: string; text: string }[] = [
  { bg: "bg-rose-500/80",    text: "text-rose-50" },
  { bg: "bg-orange-500/80",  text: "text-orange-50" },
  { bg: "bg-amber-500/80",   text: "text-amber-50" },
  { bg: "bg-yellow-500/80",  text: "text-yellow-50" },
  { bg: "bg-lime-500/80",    text: "text-lime-50" },
  { bg: "bg-emerald-500/80", text: "text-emerald-50" },
  { bg: "bg-teal-500/80",    text: "text-teal-50" },
  { bg: "bg-cyan-500/80",    text: "text-cyan-50" },
  { bg: "bg-sky-500/80",     text: "text-sky-50" },
  { bg: "bg-blue-500/80",    text: "text-blue-50" },
  { bg: "bg-indigo-500/80",  text: "text-indigo-50" },
  { bg: "bg-violet-500/80",  text: "text-violet-50" },
  { bg: "bg-purple-500/80",  text: "text-purple-50" },
  { bg: "bg-fuchsia-500/80", text: "text-fuchsia-50" },
  { bg: "bg-pink-500/80",    text: "text-pink-50" },
];

// Stable string hash → palette index. djb2 because it's tiny, fast,
// and well-distributed across short strings (usernames).
function paletteIndexFor(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
  }
  return Math.abs(h) % PALETTE.length;
}

// Detect Clerk's auto-generated default avatars. These come back even
// when `hasImage` is false (Clerk fills the field with a placeholder),
// so we need a URL-pattern check too — otherwise existing users in the
// DB with these placeholders saved would keep showing silhouettes
// until their next sync.
function isClerkDefault(url: string): boolean {
  // Examples we want to bypass:
  //   https://img.clerk.com/preview.png?...
  //   https://images.clerk.dev/uploaded/img_anonymous_...
  // We DO want to keep real uploads like:
  //   https://img.clerk.com/eyJ...   (these ARE generated-with-initials
  //   but are per-user, so we let them through — they look fine)
  return /\/preview\.png(\?|$)/.test(url) || /img_anonymous/.test(url);
}

// Whether a URL is safe to render via next/image. We only allow the
// hosts we've explicitly configured in next.config.ts (mirrored here
// for client-side cheapness). Blocks data: / blob: / javascript: URLs
// and any third-party host that snuck into the DB — those would crash
// next/image at request time and could be an exfiltration vector if a
// malicious display name made its way into imageUrl.
const ALLOWED_IMAGE_HOSTS = new Set([
  "img.clerk.com",
  "images.clerk.dev",
  "secure.gravatar.com",
  "lh3.googleusercontent.com",
  "yt3.googleusercontent.com",
  "i.scdn.co",
]);
function isSafeImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function Avatar({
  imageUrl,
  name,
  seed,
  size = 32,
  ring = true,
  className = "",
}: {
  imageUrl?: string | null;
  // The display name (or username) for the initial fallback. We pull
  // the first character — emoji + multi-byte clusters get correctly
  // handled by Array.from since it iterates by code point.
  name: string;
  // Deterministic color seed. Pass the user id when you have it so
  // a renamed user keeps the same color; fall back to `name` otherwise.
  seed?: string | null;
  // Pixel size of the rendered circle. Keep ≤ 64 for `next/image`
  // intrinsic sizing; component renders width/height explicitly.
  size?: number;
  // Whether to draw a 2px ring matching the page bg, useful when the
  // avatar overlaps art (like the rec rail stack).
  ring?: boolean;
  className?: string;
}) {
  const showImage =
    !!imageUrl && isSafeImageUrl(imageUrl) && !isClerkDefault(imageUrl);
  const initial =
    Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  const palette = PALETTE[paletteIndexFor((seed || name || "?").toLowerCase())];
  const ringCls = ring ? "ring-2 ring-neutral-900" : "";
  const radius = "rounded-full";

  // Initials font sizing. Linear scale (size * 0.42) reads fine at
  // ≥32px but goes blurry-thin at very small sizes — at 20px that's a
  // 8px glyph rendered in font-weight 600, easy to mistake for a smudge.
  // Floor it at 10px so the initial stays legible across the smallest
  // avatar slots (comment-reply, friend-stack overflow chip).
  const dim = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.round(size * 0.5)),
  };

  if (showImage) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`${radius} ${ringCls} object-cover shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`${radius} ${ringCls} ${palette.bg} ${palette.text} inline-flex items-center justify-center font-bold tracking-tight shrink-0 select-none ${className}`}
      style={{ width: dim.width, height: dim.height, fontSize: dim.fontSize }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
