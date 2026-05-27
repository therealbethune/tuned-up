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

const UPDATED = "May 27, 2026";

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
          optional review, mood tag, and cover-theme preference), comments,
          likes, follows, recommendations you send and receive, songs you
          save for later, friend suggestions you dismiss, and any reports
          or blocks you submit (we keep these to act on moderation issues
          and to enforce that blocked users stay hidden from your view).
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
          <strong>Apple Music (only if you connect it)</strong>: when you tap
          &ldquo;Connect Apple Music&rdquo; in Settings, we store the MusicKit
          user token your device hands us. We use it to fetch your recent
          listening from Apple&rsquo;s API and to optionally add songs to your
          library when you tap Save. The token is treated as sensitive
          credential data, scoped to your account, and removed immediately
          when you tap Disconnect or delete your account. Revoking us from
          your Apple ID terminates it too.
        </li>
        <li>
          <strong>Apple Music recent listens (only if you connect it)</strong>:
          if you connect Apple Music, we cache up to your last 50 played
          tracks — title, artist, album, artwork URL, Apple Music URL, and
          our best estimate of when each was played. Friends see this on
          your profile (subject to the visibility setting you choose:
          followers, anyone, or only me). Disconnecting deletes all rows.
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
          <strong>Spotify Web API</strong> — anonymous title-artist lookups
          (app-credentials only) so we can show an &ldquo;Open in Spotify&rdquo;
          deep link on songs you rate. No account data is sent and Tuned Up
          does not connect to or read from your personal Spotify account.
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

      <h2 className="text-xl font-semibold pt-4">Reports &amp; moderation</h2>
      <p>
        You can flag offensive ratings, comments, or profiles via the
        in-app Report button, and you can block another user from your
        profile or theirs. Reports go to Tuned Up&rsquo;s moderation
        queue and are reviewed by humans within 24 hours. Blocking
        hides the blocked user&rsquo;s content from you and yours from
        them. You can see + undo your blocks any time in Settings.
      </p>

      <h2 className="text-xl font-semibold pt-4">How to delete your data</h2>
      <p>
        Go to Settings → Delete account. This permanently removes your account
        from both Clerk and our database, including all ratings, reviews,
        comments, likes, follows, recommendations, blocks, reports, and push
        subscriptions. Other users&rsquo; data referring to yours (e.g.
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
