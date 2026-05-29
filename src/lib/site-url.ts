import { encodeBase64Url } from "@/lib/encoding";

// Canonical public origin for Tuned Up. ALWAYS use this to build an
// absolute URL that will be seen OUTSIDE the current browser tab —
// share links, OG image URLs, emails, push deep-links.
//
// Do NOT derive the public origin from `window.location.origin` or from
// Netlify's `process.env.URL`. The app is also served from
// tuned-up.netlify.app (and deploy-preview subdomains), so a link built
// from the current origin leaks the wrong host into iMessage / Slack /
// Twitter unfurls — which is exactly the "tuned-up.netlify.app instead
// of tuned-up.com" bug. There is one canonical domain; pin it here.
//
// Override via NEXT_PUBLIC_SITE_URL only if the canonical domain itself
// changes (the value is inlined into the client bundle at build time).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://tuned-up.com"
).replace(/\/+$/, "");

// Relative path to the OG share-card image for a rating.
//
// Identity is carried in PATH SEGMENTS, not query params, on purpose:
// Netlify's durable cache (which `export const revalidate` opts the
// route into) keys on the pathname only. A query-string key
// (?u=&s=) collapsed every rating onto a single `/api/og/rating` cache
// slot, so social unfurls served whichever song was rendered last
// instead of the one being shared. A distinct path per (user, song)
// gives each its own cache entry. songId is base64url-encoded so the
// `:` in `yt:<videoId>` survives path routing.
export function ogRatingImagePath(username: string, songId: string): string {
  return `/api/og/rating/${encodeURIComponent(username)}/${encodeBase64Url(songId)}`;
}

// Absolute, canonical OG image URL (always on SITE_URL) — used in
// metadata so unfurl bots fetch the card from the canonical host
// regardless of which origin rendered the page.
export function ogRatingImageUrl(username: string, songId: string): string {
  return `${SITE_URL}${ogRatingImagePath(username, songId)}`;
}

// Absolute, canonical public share URL for a rating (always tuned-up.com).
export function shareRatingUrl(username: string, songId: string): string {
  return `${SITE_URL}/r/${encodeURIComponent(username)}/${encodeBase64Url(songId)}`;
}
