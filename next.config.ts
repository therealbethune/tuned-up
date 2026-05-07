import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Next/Image optimization for the third-party image hosts we pull from.
  // Anything not on this allowlist still falls through to the unoptimized
  // <Image> path because we keep that prop on a few callsites — but for these
  // hosts we get automatic resizing, format negotiation, and lazy-loading.
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

export default nextConfig;
