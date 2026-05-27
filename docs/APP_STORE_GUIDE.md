# Tuned Up → App Store: end-to-end submission guide

This is a working checklist. Read top-to-bottom the first time, then keep
it open during the actual submission.

Last updated: May 27, 2026.

---

## 0. Reality check before anything else

The App Store **does not accept pure web URLs**. To ship Tuned Up to iOS,
you'll wrap the existing Next.js web app in a thin native shell.
**Capacitor** is the right tool for this — it's purpose-built for shipping
web apps to App Stores, has a small bridge surface, and Apple has no
problem with it (used by Sworkit, Burger King, etc.).

The submission flow looks like this:

1. Create an Apple Developer account (one-time, $99/year)
2. Set up the Capacitor wrapper around the deployed web app
3. Wire native plugins for push, deep links, network
4. Build the iOS binary in Xcode
5. Push to TestFlight, get feedback from real devices
6. Submit to App Store review

Plan on **2–4 weeks** from "first Xcode build" to "approved app." Apple's
review queue averages 24–48 hours, but the first submission almost always
hits at least one rejection round.

---

## 1. Prerequisites you need to gather

Before writing any Xcode code, collect these so you don't stall later:

### Apple Developer Program
- [ ] **Apple ID for the developer account.** Use a dedicated one tied to
      your brand email if possible (not your personal Apple ID).
- [ ] **Enroll in the Apple Developer Program.** $99/year. Allow 1–2 days
      for verification — Apple sometimes asks for a phone call or DUNS
      number for organization enrollments. Sign up at
      https://developer.apple.com/programs/enroll/
- [ ] **Two-factor auth enabled on the Apple ID** — required.

### Bundle identifier + signing
- [ ] **Pick a bundle ID.** Reverse-DNS, lowercase: `com.tunedup.app` is
      the obvious choice. **You cannot change this after launch** — pick
      carefully.
- [ ] **Create the App ID in Apple Developer portal.** Identifiers →
      App IDs → "+" → Explicit App ID → enter `com.tunedup.app` and
      enable the capabilities you'll need:
      - Push Notifications
      - Associated Domains (for Universal Links to `tuned-up.com`)
      - Sign in with Apple
      - MusicKit (if you keep the Apple Music integration)

### App Store Connect record
- [ ] **Create the App Store Connect listing.** appstoreconnect.apple.com
      → My Apps → "+" → New App. You'll need:
      - Name: `Tuned Up`
      - Bundle ID: the one you just created
      - SKU: anything unique to you, e.g. `tunedup-ios-001`
      - Primary language: English (U.S.)

### Hosting + auth
- [ ] **Decide where the web app deploys to.** Today it's at
      `tuned-up.com` on Netlify. The Capacitor wrapper will load this
      URL. **The wrapper is NOT a fresh build of the web app** — it
      points at the live production deployment. Keep that domain stable.
- [ ] **Clerk production keys.** App Store reviewers will sign in with
      their test account. You need:
      - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set to `pk_live_…`
      - `CLERK_SECRET_KEY` set to `sk_live_…`
      - Already verified in this codebase: the startup-check in
        `instrumentation.ts` will log a loud warning if either is still
        `pk_test_…`. Apple reviewers signing in via the dev Clerk
        instance would get bogus user IDs that don't match the DB.
- [ ] **Sign in with Apple enabled in Clerk dashboard.** Required by
      App Store Guideline 4.8 because Clerk also offers Google. **This
      is a config-only change but it WILL block submission if missing.**
      Verify by signing in fresh and seeing an "Continue with Apple"
      button in the Clerk flow.

### Apple Music + MusicKit
- [ ] **Decide whether the iOS build ships with Apple Music features.**
      MusicKit JS works in Safari but its terms restrict usage in
      Capacitor wrappers. Two paths:
      - **Path A (recommended for v1):** disable the
        `SaveToAppleMusicButton` and `AppleMusicListeningCard` in the
        Capacitor build. Already implemented for save-to-library — the
        button now hides itself via `Capacitor.isNativePlatform()`. Do
        the same for the listening connect card before submission.
      - **Path B (later):** wire a Capacitor plugin around the native
        MusicKit iOS framework. More work, but unlocks parity with
        Apple Music users.

### Assets
- [ ] **App icon set.** 1024×1024 master at minimum; Xcode will generate
      the rest. **Cannot have transparency** for the App Store icon.
      Use Figma or `sharp-cli`. The TunedUpMark in `icons.tsx` is your
      visual base — render at high resolution against a solid emerald
      background.
- [ ] **Screenshots.** Required sizes (as of 2026):
      - 6.7" iPhone (iPhone 15 Pro Max): 1290×2796
      - 6.5" iPhone (iPhone 11 Pro Max): 1242×2688 — *fallback, used
        when you don't provide 6.7"*
      Capture at least **3 screenshots** per size. Easiest: open Safari
      → tuned-up.com → Responsive Design Mode at 1290×2796 → take
      screenshots of /feed, /discover, /album/<a-great-rating>, /me/stats.
- [ ] **Launch screen / splash.** Capacitor uses `Resources/Splash.png`
      for the static splash. 2732×2732 master.
- [ ] **App Store privacy policy URL.** Use the deployed
      `https://tuned-up.com/legal/privacy` — already exists.
- [ ] **App Store support URL.** Use `https://tuned-up.com/legal/terms`
      or a dedicated support page. Reviewers email this.
- [ ] **Marketing URL.** The homepage `https://tuned-up.com` is fine.

---

## 2. Capacitor wrapper setup

This is the work that turns the web app into something you can submit.

### Install
```bash
# In a NEW directory next to the song-rater repo (not inside it).
mkdir tunedup-ios && cd tunedup-ios
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "Tuned Up" "com.tunedup.app" --web-dir=www
```

### Configure to point at the live web app
Create `capacitor.config.ts`:
```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.tunedup.app",
  appName: "Tuned Up",
  // The web app lives at the live domain — the wrapper loads it
  // remotely. This is the standard Capacitor pattern for a server-
  // rendered app like Next.js where building static assets isn't
  // possible. Make sure the domain has a valid SSL cert and
  // Universal Links are configured (see Associated Domains below).
  server: {
    url: "https://tuned-up.com",
    // hostname: "tuned-up.com"   ← only if you proxy locally for dev
    androidScheme: "https",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
    // Required for Apple Music + Push.
    scheme: "Tuned Up",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#10b981",
      androidSplashResourceName: "splash",
      iosSpinnerStyle: "small",
    },
  },
};

export default config;
```

### Add iOS platform
```bash
npx cap add ios
npx cap sync
npx cap open ios   # opens Xcode
```

### Native plugins to install
```bash
npm install @capacitor/push-notifications @capacitor/app @capacitor/status-bar @capacitor/splash-screen @capacitor/preferences
npx cap sync
```

### Xcode configuration checklist
Inside Xcode:
- [ ] **Signing & Capabilities → "+":** add
      - Push Notifications
      - Sign In with Apple
      - Associated Domains (for Universal Links: `applinks:tuned-up.com`)
- [ ] **Info.plist:** Add usage descriptions for anything the app touches:
      - `NSUserTrackingUsageDescription` — only if you ever add analytics.
        Without it you're "no tracking" which is simpler.
      - `NSAppleMusicUsageDescription` — *only if* you ship MusicKit
        features in the wrapper (Path B above). Skip for v1.
- [ ] **App Icons:** drag your 1024×1024 master into the asset catalog;
      Xcode generates the rest.
- [ ] **Bundle Display Name:** "Tuned Up" (this is what shows under
      the icon on Home Screen).
- [ ] **Build → Archive** to make sure it compiles cleanly.

---

## 3. Required code changes before submission

These are all things to fix in the song-rater repo, then redeploy, before
the Capacitor wrapper points at the new build:

### Already done in this session ✅
- [x] In-app account deletion (`/api/account/delete` + Settings UI)
- [x] Privacy policy + Terms pages, linked from Settings and homepage
- [x] UGC moderation (reports + blocks + blocked-users list)
- [x] Privacy policy updated to disclose Apple Music token storage,
      listening history, mood/cover-theme/dismissed-suggestions/saved-songs
- [x] Tap targets bumped to 44pt on streaming-service chips
- [x] Inline Terms+Privacy disclosure on sign-up CTA
- [x] `SaveToAppleMusicButton` hides in Capacitor (Path A above)
- [x] Startup env-sanity check for Clerk test keys in prod

### Still to do before first submission
- [ ] **Hide the `AppleMusicListeningCard` in Capacitor as well.** Same
      pattern as `SaveToAppleMusicButton` — wrap the render in a
      `isCapacitorNative()` check that returns null. Otherwise reviewers
      will tap "Connect Apple Music" and hit a broken MusicKit JS flow.
- [ ] **Verify `ADMIN_USER_IDS` is set in Netlify production env.**
      Without it, no one can drain the report queue, and Apple expects
      moderation within 24 hours of a report (App Store Review
      Guideline 1.2).
- [ ] **Confirm Sign In with Apple is enabled in the Clerk production
      dashboard,** listed alongside Google. Test by signing out and
      tapping "Get started" — both options must appear.
- [ ] **Confirm the live `Tuned Up` site loads inside a `WKWebView`
      without 3rd-party-cookie surprises.** Clerk's session cookies
      need to work in the wrapper context.
- [ ] **Universal Links file at `https://tuned-up.com/.well-known/apple-app-site-association`** — required to route `tuned-up.com/r/<user>/<song>` shares into the native app instead of Safari. JSON content:
      ```json
      {
        "applinks": {
          "apps": [],
          "details": [
            {
              "appID": "TEAMID.com.tunedup.app",
              "paths": ["*"]
            }
          ]
        }
      }
      ```
      Served with `Content-Type: application/json`. Apple's verifier
      will check this from `swcd` during install — get it right or
      Universal Links silently break.

---

## 4. App Store Connect — listing data

You'll fill these in the listing page. Have them ready:

- **App name:** Tuned Up
- **Subtitle (30 char):** "Rate every song. Follow your taste."
- **Promotional text (170 char, can change anytime):** "Score tracks
  1–100, build a profile of your taste, and see what your friends are
  listening to. New: live Apple Music status on friends' profiles."
- **Description (4000 char):** Hand-written 200–400 words. Cover:
  what the app does, the score model, the social layer, the Apple Music
  integration, and "no ads, no payment, free."
- **Keywords (100 char, comma-separated, no spaces):**
  `music,rating,review,score,taste,friends,playlist,social,discover,share`
- **Support URL:** `https://tuned-up.com/legal/terms`
- **Marketing URL:** `https://tuned-up.com`
- **Privacy Policy URL:** `https://tuned-up.com/legal/privacy`
- **Age rating:** answer the questionnaire honestly. Tuned Up has:
  - User-generated content: **Yes** (ratings, comments, usernames)
  - Moderation: **Yes** (reports + blocks + admin queue, 24h SLA)
  - Profanity/crude humor: **Possibly** (user reviews can contain it)
  - Likely outcome: **17+**. Don't fight it; UGC apps almost always
    land at 17+.

### App Privacy nutrition label
The audit walked every data-touching code path. Use this answer set:

- **Data Used to Track You:** None
- **Data Linked to You:**
  - Contact info → Email address (Clerk, for authentication)
  - User content → Audio data (Apple Music token + listening history,
    if user connects)
  - User content → Customer support (reports)
  - User content → Other user content (ratings, reviews, comments,
    follows, likes, recommendations, saves, dismissed suggestions,
    cover-theme preference, mood tags)
  - Identifiers → User ID (Clerk user_id)
  - Diagnostics → Performance data (Sentry, server logs)
  - Diagnostics → Crash data (Sentry)
- **Data Not Linked to You:** None

For each linked category, the **purpose** is "App Functionality" — not
"Analytics," "Advertising," or anything else.

---

## 5. TestFlight

This is your real validation. Don't submit to App Store review until
TestFlight is green.

- [ ] Build & Archive in Xcode → "Distribute App" → App Store Connect →
      Upload. First upload takes ~15 minutes to process.
- [ ] In App Store Connect → TestFlight → wait for "Ready to Submit."
- [ ] Add internal testers (yourself + anyone with an Apple ID on your
      developer team). Internal testing is unrestricted.
- [ ] Install TestFlight on a real iPhone, install the build, sign in,
      walk every flow:
      - [ ] Sign up fresh (test "Sign in with Apple" specifically)
      - [ ] Onboarding (`/welcome`) → rate at least 3 songs
      - [ ] Feed loads, scrolls, rating cards render
      - [ ] Audio preview button — synchronous play on first tap
      - [ ] Like, comment, share, save flows all work
      - [ ] Block + Report a test account from your second device
      - [ ] Push notifications: enable from /me, receive a test push
      - [ ] Connect Apple Music in Settings (or verify it's hidden in
            Capacitor if you went Path A)
      - [ ] Open Settings → Delete account → confirm the account is
            actually gone (check Clerk dashboard + Neon `users` table)
      - [ ] Verify Universal Links: tap a `tuned-up.com/r/...` share
            URL from Messages — it should open the app, not Safari
- [ ] Optional but recommended: add 5–10 external testers via TestFlight.
      Apple does NOT review external-test builds beyond a beta-review
      step (24h). Get a few people to use it for a week.

---

## 6. Submission

Once TestFlight is clean and you've used the app yourself for at least
a week:

- [ ] App Store Connect → Distribution → "+ App Version" → select your
      build.
- [ ] Fill the version listing (screenshots, description, etc. — see §4).
- [ ] **"App Review Information" section** — this is the secret weapon.
      Fill the "Notes" field with:
      ```
      Demo account credentials:
        email: review-demo@tuned-up.com
        pwd:   (set up via Clerk dashboard, give reviewers a working login)

      Apple Music testing:
        The Apple Music connect flow requires an active Apple Music
        subscription. If you don't have one, the feature is gracefully
        hidden — please test other parts of the app.

      UGC moderation:
        Reports queue: this account has admin access at /admin/reports.
        We act on reports within 24 hours per Guideline 1.2.

      Notes:
        - The app uses Capacitor to wrap https://tuned-up.com.
        - All data is fetched live from our Neon Postgres + Clerk auth.
        - Sign in with Apple is offered alongside Google.
      ```
      **Reviewers will use this account.** Don't skip — without test
      credentials they cannot test the auth-gated flows, which usually
      means a rejection asking for them.

- [ ] Submit for review.

---

## 7. What to expect during review

- **First-pass rejection probability: 60–80%.** This is normal. The most
  common reasons for a Tuned Up-shaped app:
  - Missing or broken demo account credentials in the Notes field
  - Sign in with Apple not surfaced (Guideline 4.8)
  - A broken feature on a flow they tested (audio preview, MusicKit
    button, push notification prompt timing)
  - Privacy policy missing a disclosed data category
- **Response window:** Apple's review team responds 24–48 hours after
  submission. Resolution after a rejection requires a re-submit, which
  re-enters the queue at the back (so add another 24–48h).
- **Plan for at least 2 rejection rounds.** Don't try to launch on a
  fixed PR date; pad two weeks.

---

## 8. Post-launch maintenance

- **Auto-updating the web app does NOT require a new App Store build.**
  Because the wrapper points at the live domain, your normal Netlify
  deploys ship instantly to the iOS app. **This is the killer feature
  of the Capacitor + remote-URL pattern.**
- **What DOES require a new App Store build:**
  - Anything in `capacitor.config.ts`
  - New native capabilities (e.g. wiring MusicKit native, IAP)
  - Updating the splash, app icon, bundle ID, Info.plist
- **App Privacy Nutrition Label** must be updated within 24h of any
  new data-collection feature. Set a reminder.

---

## 9. Things I can do for you on demand

Things in this guide that need code changes in the song-rater repo —
let me know and I'll knock them out:

- Hide the AppleMusicListeningCard in Capacitor (parity with
  SaveToAppleMusicButton)
- Add the `.well-known/apple-app-site-association` JSON route
- Add a `capacitor.config.ts` and `ios/` directory scaffold (Apple
  Developer account + Xcode work would still be on you)
- Write a longer App Store description draft once you tell me the tone
  you want
- Build a "demo account seeder" admin endpoint that creates a fresh
  review-demo@tuned-up.com user with sample ratings + follows pre-loaded

Things outside what I can do for you:
- Enroll in Apple Developer Program
- Build/sign/upload via Xcode
- Take real screenshots on a physical iPhone
- Respond to Apple reviewer feedback (you'll get a message in App Store
  Connect)
