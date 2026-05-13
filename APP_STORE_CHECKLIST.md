# App Store Readiness Checklist

Live tracker for getting Tuned Up onto the Apple App Store. Edit
checkboxes as items land.

## Phase 1 — Web-app prep (no Mac needed)

- [x] `/legal/privacy` page drafted, linked from /, /settings
- [x] `/legal/terms` page drafted, linked from /, /settings
- [x] `support@tuned-up.com` mailto on both surfaces
- [x] Account deletion flow (in-app) — already shipped (Settings → Delete)
- [x] **Guideline 1.2 — UGC moderation:** Report flow on every UGC
      surface (ratings, comments, profiles) + Block flow on profiles.
      Reports table + `/admin/reports` queue for staff action within
      24h. Blocking is two-way — blocked users disappear from feed,
      discover, suggestions, profile, comments, and album reviewer rail.
- [x] **Removed per-user Spotify account linking.** Spotify API still
      powers anonymous catalog lookups (resolve a YT-Music track id →
      Spotify track id for the "Open in Spotify" deep link), but the
      OAuth flow + Connect Spotify cards + Save-to-Spotify buttons are
      gone. One fewer integration limit to manage; one fewer App Store
      Connect "data linked to you" disclosure.
- [ ] **Sign in with Apple via Clerk** — REQUIRED by Guideline 4.8 since we
      also offer Google/etc. Steps:
      1. Apple Developer Program → Certificates → "Services ID"
      2. Configure a return URL pointing at Clerk's Apple callback
      3. Clerk Dashboard → User & Authentication → SSO Connections → enable Apple
      4. Verify the "Sign in with Apple" button appears on the Clerk-rendered
         sign-in card
- [ ] **Confirm the `privacy@` and `support@` mail aliases actually route**
      (the policy is useless if mail bounces)
- [ ] Lawyer-review the privacy + terms drafts (engineering-drafted today)
- [ ] App Store-friendly onboarding: ensure /welcome doesn't ASK for permissions
      we don't yet need (push permission prompt is fine, but should be tap-to-opt-in
      not automatic)
- [ ] Add an in-app version of the privacy/terms acceptance moment at sign-up
      (Clerk's flow already shows them; just verify the links point at
      tuned-up.com/legal/* once those URLs land in production)

## Phase 2 — Capacitor scaffold (needs Mac + Xcode)

- [ ] Install Xcode + Command Line Tools
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/ios`
- [ ] `npx cap init "Tuned Up" "com.tunedup.app" --web-dir=public`
      (we'll point the WebView at tuned-up.com, so web-dir is a stub)
- [ ] Configure `capacitor.config.ts`:
      - `server.url = "https://tuned-up.com"` (load the production site)
      - `server.androidScheme` + `iosScheme` (default "https")
      - Allow-list our streaming partner domains
- [ ] `npx cap add ios` — generates the ios/ Xcode project
- [ ] `@capacitor/push-notifications` plugin
      - Server-side: add a `nativePushToken` column to push_subscriptions, or a
        sibling `apns_subscriptions` table
      - Client-side: register for permission on first launch (or first useful
        moment); POST the APNs token to a new `/api/push/apns/subscribe` route
      - Server send path: branch on subscription kind — web push uses web-push,
        APNs uses the apple/apn package
- [ ] `@capacitor/share` plugin → swap the web Share API call in ShareButton
      to use Capacitor.Share when running natively (graceful fallback to
      navigator.share when not)
- [ ] App icon set (1024×1024 + all derived sizes — Capacitor has an asset
      generator: `@capacitor/assets`)
- [ ] Splash screen (12 sizes for iOS; @capacitor/assets handles it from one
      input)
- [ ] Status-bar style match dark theme: `StatusBar.setStyle({ style: Style.Dark })`
      on app launch
- [ ] Verify deep-links work: opening a `/r/<username>/<songId>` URL from iOS
      Mail / iMessage should open the app, not Safari
- [ ] Add `@capacitor/app` for app-state events (background/foreground) to
      pause the Spotify now-playing polling

## Phase 3 — App Store Connect submission

- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] App Store Connect → create a new app
      - Bundle ID: `com.tunedup.app` (must match capacitor.config.ts)
      - Primary language: English (US)
      - SKU: `tuned-up-ios-001`
- [ ] App Privacy details (in App Store Connect, separate from our /legal/privacy):
      - Data Linked to You: Identifiers (User ID), Contact Info (Email Address),
        User Content (Audio Data — ratings; Other User Content — reviews,
        comments)
      - Data Not Linked to You: Diagnostics (Crash Data via Sentry)
      - Tracking: None
- [ ] Age rating: complete the questionnaire honestly (probably 12+ given
      user-generated reviews could contain language)
- [ ] Screenshots: 6.7" (iPhone 15 Pro Max) AND 6.5" (iPhone 11 Pro Max)
      minimum. Five screens, the captioning we want to lead with:
      1. /feed — "See what your friends are listening to"
      2. /album with histogram — "Every song scored 1-100"
      3. RateButton modal — "Quick to rate"
      4. /discover hero — "Find your next favorite"
      5. /me/stats — "Your taste, charted"
- [ ] App Preview video (optional but helps): 30s screen-recorded walkthrough
- [ ] Marketing URL: https://tuned-up.com
- [ ] Privacy Policy URL: https://tuned-up.com/legal/privacy
- [ ] App Review information:
      - Demo account credentials (a long-lived Tuned Up account with some
        existing data the reviewer can browse)
      - Notes describing the social aspect; mention that signup is required
        and we offer Sign in with Apple
- [ ] First TestFlight build → internal testers
- [ ] First external build → submit for review

## Apple App Store Review Guidelines we're most likely to trip on

- **1.2** — User-Generated Content moderation: ✓ Report flow on every
              UGC surface + Block flow on profiles. Reports queue in
              `/admin/reports` is the staff action surface. Set
              `ADMIN_USER_IDS` env var to the Clerk ids of moderators.
- **2.5.1** — Use only public APIs. ✓ (web app, no private iOS APIs)
- **4.2.2** — Apps that are just packaged websites get rejected. We need
              demonstrable native value: APNs push, share sheet, MusicKit JS
              (or eventually native MusicKit), splash + icon. Capacitor approach
              + APNs + share sheet should clear this bar.
- **4.7 / 4.7.1** — HTML5 apps allowed if they don't include arbitrary code
              execution or "extensions to the App Store". We're fine.
- **4.8** — Apple Sign-In required if other social sign-ins are offered. **Action item
              above.**
- **5.1.1** — Privacy policy URL required, must describe what data is collected
              and shared. Drafted; needs lawyer review.
- **5.1.1(v)** — Account deletion required in-app for any app that lets
              users create an account. ✓ already shipped.
- **5.1.2** — App Tracking Transparency: we don't track across apps, so the
              prompt isn't required. Verify Sentry config doesn't fingerprint.
              (Already set `sendDefaultPii: false`.)
- **5.6** — Developer Code of Conduct. We're fine.

## Sign in with Apple — wiring notes

Clerk handles the OAuth dance; we just need to:

1. **Apple Developer Console** (the Apple side):
   - App IDs → register an App ID with bundle id `com.tunedup.app`, enable
     "Sign in with Apple" capability
   - Identifiers → Services IDs → create one for the web flow (e.g.
     `com.tunedup.web`), set Return URLs to Clerk's documented callback
     (`https://*.clerk.accounts.dev/v1/oauth_callback` or similar — Clerk's
     dashboard tells you the exact URL when you start the wiring)
   - Keys → create a Sign in with Apple key, download the `.p8` file

2. **Clerk Dashboard**:
   - User & Authentication → Social Connections → Apple
   - Paste the Services ID, Team ID, Key ID, and the contents of the `.p8`
   - Save

3. **Verify**:
   - Open the production site in an incognito browser, hit Sign in
   - The Clerk-rendered card should now show an Apple button alongside
     Google / email
   - Sign in with an Apple ID end-to-end; confirm a `users` row gets
     created and `syncCurrentUser` populates it correctly

4. **App Store Connect listing**:
   - In the App Information page, list Sign in with Apple as a supported
     authentication method. Apple checks for this during review.

## Future improvements — ideas worth considering

These don't block App Store submission but would meaningfully improve
the product. Roughly ranked by user-impact / effort ratio.

- **"Save for later" pile**: a `saved_songs` join table + a /me/saved
  page so users can bookmark songs they hear in the wild and want to
  rate later. Replaces the (gone) Spotify save-to-library flow with
  something that lives entirely inside Tuned Up. New table + Save
  button on the rate flow + a small list page — ~half a day of work.

- **Year-in-review / month-in-review recap**: end-of-year shareable
  card showing your top 10 songs, distribution, taste shifts. Pure
  read on existing data; the appeal is in the visual design (gradient
  cards, downloadable PNG via /api/og/...).

- **Genre + decade filters on /me/stats**: depends on song metadata
  we don't currently store. Would require enriching `songs` with
  genre + release-year via a one-time scrape from MusicBrainz or the
  Spotify API client-credentials flow we kept.

- **Push-notification settings UI**: today's PushBanner is all-or-
  nothing. Per-category toggles (mentions vs likes vs follows) would
  let users keep notifications on without dread.

- **Comment threading depth > 1**: currently replies-to-replies flatten
  to the same parent. The schema already has parentCommentId so this
  is mostly a UI nesting change.

- **Native Capacitor screens for taste-test onboarding**: a swipe-rate
  carousel for the first 10 ratings would feel premium on iOS in a
  way the web search-and-rate flow doesn't. Build it after Capacitor
  scaffolding lands so the gesture handling can be native.

- **Trust-and-safety dashboards**: a per-user moderation history in
  /admin (reports filed against them, reports they've filed, blocks
  against them, etc.) so a moderator can see patterns before banning.

- **Soft-deleting reported content** instead of hard-deleting from
  the admin queue, with an audit trail. Lets us reverse a bad mod
  decision; currently delete is permanent.
