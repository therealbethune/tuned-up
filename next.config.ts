import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Disable the X-Powered-By: Next.js header — minor fingerprint
  // surface reduction. Apple App Store scanners flag it; turning it
  // off costs nothing.
  poweredByHeader: false,

  // Keep prefetched dynamic routes in the client router cache for 30s
  // (default is 0 — every navigation re-fetches dynamic data). Static
  // segments stay 5 min. Net effect: tapping Feed → Me → Feed within
  // 30s reuses the cached Feed render instead of re-rendering the
  // server component, which was the heaviest part of the "switching
  // tabs is slow" complaint.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },

  // Security headers applied to every response — including the
  // dynamic Next.js function responses that bypass netlify.toml
  // [[headers]] blocks. Without this path, the netlify.toml headers
  // only land on /_next/static/* assets, leaving the actual HTML +
  // JSON responses (where the real attack surface is) unguarded.
  //
  // What's here vs. what's not:
  //   ✓ HSTS w/ includeSubDomains + preload — forces HTTPS forever.
  //   ✓ X-Frame-Options DENY — clickjacking; no embed use case.
  //   ✓ X-Content-Type-Options nosniff — defense against MIME confusion.
  //   ✓ Referrer-Policy strict-origin-when-cross-origin — same as Next's
  //     default; explicit so it can't disappear on a framework change.
  //   ✓ Permissions-Policy — turn off APIs we never use (camera, mic,
  //     geo, payment, USB, etc.) so a future XSS can't tap them.
  //   ✗ Content-Security-Policy — NOT set yet. CSP for Next + Clerk +
  //     MusicKit + Sentry + iTunes artwork CDN needs nonce-based
  //     scripts; rolling out without that breaks Clerk's hosted UIs.
  //     Tracked in docs/APP_STORE_GUIDE.md.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), midi=(), magnetometer=(), accelerometer=(), gyroscope=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
  // Allow Next/Image optimization for the third-party image hosts we pull
  // from. Every <Image> in the app loads from one of these hosts, so we
  // can rely on automatic resizing, format negotiation, and lazy-loading
  // — no `unoptimized` escape hatches anywhere. If you add a new host
  // (new streaming service, new avatar source), add it here too or the
  // image will 400 at build/runtime.
  images: {
    remotePatterns: [
      // YouTube Music album art / artist photos
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
      // Spotify album art (when a user imports their top tracks)
      { protocol: "https", hostname: "i.scdn.co" },
      // Apple Music / iTunes album art (used in the OG share card)
      { protocol: "https", hostname: "is1-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is2-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is3-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is4-ssl.mzstatic.com" },
      { protocol: "https", hostname: "is5-ssl.mzstatic.com" },
      // Clerk avatars
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      // Gravatar (Clerk's fallback avatar source)
      { protocol: "https", hostname: "secure.gravatar.com" },
    ],
  },
};

// Wrap with Sentry. The wrapper auto-discovers the three
// sentry.*.config.ts files at project root and applies build-time
// instrumentation: route-handler error boundaries, server-component
// error capture, source-map upload (when SENTRY_AUTH_TOKEN is set).
//
// Without a DSN configured, the Sentry SDK itself becomes a no-op
// at runtime — so local dev + preview deploys without env vars are
// unaffected. The wrapper only adds build-time plumbing.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet build unless we're in CI debugging the upload step.
  silent: !process.env.CI,
  // Include framework chunks so a throw inside Next's runtime still
  // gets a useful stack.
  widenClientFileUpload: true,
  disableLogger: true,
  // Skip the source-map upload plugin when there's no auth token
  // (local dev, preview without secrets) — otherwise the build hard-
  // fails on "missing auth token". When the token IS set, the plugin
  // uploads maps and the wrapper hides them from the client bundle.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
