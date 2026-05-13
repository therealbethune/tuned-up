import Link from "next/link";
import type { Metadata } from "next";

// Privacy policy. Required by Apple App Store Connect (the listing
// itself asks for a public URL) and by App Store Review Guideline
// 5.1.1. The exact wording matters for compliance — keep it accurate
// to what the app actually does. If the data flow changes (new
// integration, new analytics provider, new third party), update this
// page in the same commit.
//
// Owner / lawyer note: this is drafted by the engineer who wrote the
// code, not a privacy lawyer. It's accurate as a description; have a
// real attorney review before production submission.

export const metadata: Metadata = {
  title: "Privacy Policy — Tuned Up",
  description: "How Tuned Up handles your data.",
};

const UPDATED = "May 12, 2026";

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-2xl mx-auto space-y-4 pb-12">
      <header className="space-y-1 mb-6">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Tuned Up</Link>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-neutral-500">Last updated {UPDATED}</p>
      </header>

      <p>
        Tuned Up is a social music-rating app at tuned-up.com. This page describes
        what data we collect, why, who we share it with, and how to remove it.
      </p>

      <h2 className="text-xl font-semibold pt-4">What we collect</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Account info from your sign-up provider</strong>: when you sign
          in with Google, Apple, or email, our auth partner Clerk shares your
          email address, a username, your display name, and (if you set one)
          your profile image with us. We never see your password.
        </li>
        <li>
          <strong>What you create in the app</strong>: ratings (1–100 with an
          optional review), comments, likes, follows, recommendations you send
          and receive, and which suggestions you dismiss.
        </li>
        <li>
          <strong>Timezone</strong>: a best-effort read of your browser&rsquo;s
          IANA timezone (e.g.{" "}
          <code className="text-xs">America/New_York</code>) so streak-warning
          notifications fire at the right hour for you.
        </li>
        <li>
          <strong>Push subscription</strong>: if you enable notifications, we
          store the endpoint + keys your browser issues for web push. Apple
          devices using the native iOS app instead use Apple&rsquo;s APNs
          token. We never read or send anything else through these channels.
        </li>
        <li>
          <strong>Spotify (only if you connect it)</strong>: an OAuth token
          scoped to your top tracks, now-playing, and the ability to save songs
          to your Liked Songs. You can disconnect at any time from Settings.
        </li>
        <li>
          <strong>Apple Music (only if you connect it)</strong>: a MusicKit
          user token your browser holds locally, used so you can add songs to
          your library from inside Tuned Up. We do not store this token on our
          servers; revoking us from your Apple ID terminates it.
        </li>
        <li>
          <strong>Server logs</strong>: standard request logs from our hosting
          provider (IP, user-agent, status code). Used for debugging and
          abuse-prevention only.
        </li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">What we don&rsquo;t collect</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>No advertising identifiers. We don&rsquo;t do ad targeting.</li>
        <li>
          No analytics tracking of your in-app behavior beyond aggregate counts
          you can see in your own /me/stats page.
        </li>
        <li>No payment data — Tuned Up is free.</li>
        <li>No location beyond the timezone string mentioned above.</li>
        <li>No contacts, no photo library, no microphone, no camera.</li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">Who we share with</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <strong>Clerk</strong> — handles account auth. Their privacy policy:{" "}
          <a className="text-emerald-400 hover:underline" href="https://clerk.com/legal/privacy" target="_blank" rel="noreferrer">clerk.com/legal/privacy</a>
        </li>
        <li>
          <strong>Neon</strong> — Postgres host for our database. Their privacy
          policy:{" "}
          <a className="text-emerald-400 hover:underline" href="https://neon.tech/privacy-policy" target="_blank" rel="noreferrer">neon.tech/privacy-policy</a>
        </li>
        <li>
          <strong>Sentry</strong> — error reporting. We&rsquo;ve configured
          their SDK with <code className="text-xs">sendDefaultPii: false</code>;
          stack traces are sent without your email/IP attached.
        </li>
        <li>
          <strong>Spotify</strong> — only when you&rsquo;ve connected it, and
          only to read tracks / save to your library on your behalf.
        </li>
        <li>
          <strong>Apple iTunes Search</strong> — anonymous title-artist lookups
          to find a streaming URL for songs you rate. No account data is sent.
        </li>
        <li>
          <strong>YouTube Music</strong> — anonymous search lookups when you
          search for songs.
        </li>
      </ul>
      <p>
        We do not sell your data. We do not share it with advertisers. We will
        share data with law enforcement only when compelled by a valid legal
        request.
      </p>

      <h2 className="text-xl font-semibold pt-4">What other users can see</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          By default your profile is public: anyone can see your ratings,
          reviews, follows, and basic stats.
        </li>
        <li>
          You can switch your profile to <strong>private</strong> in Settings.
          When private, only accepted followers can see your ratings, comments,
          and followers list.
        </li>
        <li>
          Your email address is never visible to other users.
        </li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">How to delete your data</h2>
      <p>
        Go to Settings → Delete account. This permanently removes your account
        from both Clerk and our database, including all ratings, reviews,
        comments, likes, follows, recommendations, push subscriptions, and
        Spotify connection. Other users&rsquo; data referring to yours (e.g.
        notifications about your activity) is removed in the same operation.
      </p>
      <p>
        If you can&rsquo;t reach the in-app delete flow for any reason, email{" "}
        <a className="text-emerald-400 hover:underline" href="mailto:privacy@tuned-up.com">privacy@tuned-up.com</a>{" "}
        and we&rsquo;ll delete your account manually within 30 days.
      </p>

      <h2 className="text-xl font-semibold pt-4">Children</h2>
      <p>
        Tuned Up is not directed at children under 13 and we don&rsquo;t
        knowingly collect data from them. If you believe a child has signed up,
        contact{" "}
        <a className="text-emerald-400 hover:underline" href="mailto:privacy@tuned-up.com">privacy@tuned-up.com</a>{" "}
        and we&rsquo;ll delete the account.
      </p>

      <h2 className="text-xl font-semibold pt-4">Changes</h2>
      <p>
        If we materially change what we collect or share, we&rsquo;ll bump the
        &ldquo;Last updated&rdquo; date above and surface a notice in-app on
        your next visit. Continued use after the change constitutes acceptance.
      </p>

      <h2 className="text-xl font-semibold pt-4">Contact</h2>
      <p>
        Privacy questions:{" "}
        <a className="text-emerald-400 hover:underline" href="mailto:privacy@tuned-up.com">privacy@tuned-up.com</a>
      </p>
    </article>
  );
}
