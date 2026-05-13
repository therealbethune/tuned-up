import Link from "next/link";
import type { Metadata } from "next";

// Terms of Use. Required by the App Store (linked from the app and
// from the App Store Connect listing). Kept short and human — long
// boilerplate doesn't actually help anyone and Apple's reviewers
// don't read past the obvious red flags either way.
//
// Engineer-drafted, lawyer-review-pending. Update when the product
// adds features that materially change the user obligations.

export const metadata: Metadata = {
  title: "Terms of Use — Tuned Up",
  description: "Rules for using Tuned Up.",
};

const UPDATED = "May 12, 2026";

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-2xl mx-auto space-y-4 pb-12">
      <header className="space-y-1 mb-6">
        <Link href="/" className="text-sm text-neutral-400 hover:text-white">← Tuned Up</Link>
        <h1 className="text-3xl font-bold tracking-tight">Terms of Use</h1>
        <p className="text-sm text-neutral-500">Last updated {UPDATED}</p>
      </header>

      <p>
        Tuned Up is a free social music-rating app. By signing in, you agree
        to these terms. If you don&rsquo;t, you can&rsquo;t use the app.
      </p>

      <h2 className="text-xl font-semibold pt-4">Your account</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>You must be at least 13.</li>
        <li>One account per person. No impersonating other people or artists.</li>
        <li>
          Keep your sign-in provider account secure. We don&rsquo;t store your
          password — auth is through Clerk and your chosen identity provider
          (Google, Apple, email magic-link).
        </li>
        <li>
          You can delete your account any time from Settings. Deletion is
          permanent.
        </li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">What you can&rsquo;t do</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          No harassment, threats, or targeted abuse of other users in reviews
          or comments. Reviews critiquing a song are fine; reviews attacking
          a person are not.
        </li>
        <li>No hate speech or content that targets people on the basis of who they are.</li>
        <li>No sexual content involving minors. Ever.</li>
        <li>
          No copyright violations — Tuned Up reviews are your opinions; copying
          someone else&rsquo;s review verbatim or pasting song lyrics into a
          review isn&rsquo;t.
        </li>
        <li>
          No automated scraping, bulk-rating bots, follow-spam, or
          mass-recommendation spam. We rate-limit by default and ban accounts
          that defeat it.
        </li>
        <li>
          Don&rsquo;t attempt to break in: no probing for vulnerabilities, no
          exploiting bugs to access other users&rsquo; private data, no
          interfering with the service&rsquo;s availability.
        </li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">What we can do</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          Remove content that violates these terms. We try to use this
          sparingly and explain why when we do.
        </li>
        <li>
          Suspend or terminate accounts that repeatedly or seriously violate
          these terms. You can email{" "}
          <a className="text-emerald-400 hover:underline" href="mailto:support@tuned-up.com">support@tuned-up.com</a>{" "}
          to appeal.
        </li>
        <li>
          Change or discontinue features. We&rsquo;ll surface notice in-app
          for material changes.
        </li>
      </ul>

      <h2 className="text-xl font-semibold pt-4">Your content</h2>
      <p>
        Your ratings, reviews, and comments are yours. By posting them, you
        grant Tuned Up a worldwide, non-exclusive license to display them
        inside the app, in shareable preview cards, and in aggregated stats
        (e.g. average scores) — purely so the app can show your content where
        it makes sense.
      </p>
      <p>
        If you delete your account, we remove all of your content. We may
        retain aggregated/anonymized data (e.g. &ldquo;1,247 users rated
        Album X this month&rdquo;) since that&rsquo;s no longer tied to you.
      </p>

      <h2 className="text-xl font-semibold pt-4">Third-party music services</h2>
      <p>
        Connecting Apple Music is optional. When you do, you&rsquo;re also
        bound by Apple&rsquo;s terms of service. Tuned Up doesn&rsquo;t pay
        for your music subscription or guarantee any Apple Music feature
        will keep working — they control their APIs. Streaming links to
        Spotify and YouTube Music are deep links only; we don&rsquo;t hold
        any account credentials for those services.
      </p>

      <h2 className="text-xl font-semibold pt-4">No warranties</h2>
      <p>
        Tuned Up is provided &ldquo;as is&rdquo;. We do our best to keep it
        running, your data safe, and the streaming-link resolutions accurate,
        but we don&rsquo;t guarantee uptime, that every song will resolve to
        every streaming service, or that the app will be free of bugs.
      </p>

      <h2 className="text-xl font-semibold pt-4">Liability</h2>
      <p>
        To the extent permitted by law, Tuned Up&rsquo;s total liability to
        you for any claim arising from your use of the service is limited
        to $100.
      </p>

      <h2 className="text-xl font-semibold pt-4">Changes</h2>
      <p>
        If we materially change these terms, we&rsquo;ll bump the &ldquo;Last
        updated&rdquo; date and surface notice in-app on your next visit.
        Continued use after the change is acceptance of the new terms.
      </p>

      <h2 className="text-xl font-semibold pt-4">Governing law</h2>
      <p>
        These terms are governed by the laws of the state of California,
        excluding its conflict-of-laws rules. Disputes go to the state and
        federal courts located in San Francisco County, California.
      </p>

      <h2 className="text-xl font-semibold pt-4">Contact</h2>
      <p>
        Questions or appeals:{" "}
        <a className="text-emerald-400 hover:underline" href="mailto:support@tuned-up.com">support@tuned-up.com</a>
      </p>
    </article>
  );
}
