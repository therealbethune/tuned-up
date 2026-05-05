# 🎵 Song Rater

Rate songs 1–100, follow other users, and see their ratings in your feed.

**Stack:** Next.js 16 (App Router) · Clerk auth · Netlify DB (Neon Postgres) · Drizzle ORM · YouTube Music search · Tailwind v4

## Local setup

```bash
npm install
cp .env.example .env.local
# fill in CLERK keys from https://dashboard.clerk.com

# Provision Netlify DB and pull env vars locally:
npx netlify login
npx netlify init        # link a Netlify site
npx netlify db init     # provisions Neon DB and sets NETLIFY_DATABASE_URL
npx netlify env:pull .env.local

# Push schema to DB:
npm run db:push

# Run dev server:
npx netlify dev         # uses Netlify env
# or: npm run dev
```

## Routes

- `/` — landing
- `/search` — search YT Music and rate
- `/feed` — ratings from people you follow + yourself
- `/me` — your profile
- `/u/[username]` — someone else's profile (with Follow button)

## Notes

- Search hits YouTube Music's public InnerTube endpoint (same data as `ytmusicapi`). Swap `src/lib/ytmusic.ts` for a Spotify implementation later.
- Songs are upserted on first rating; ids are namespaced (`yt:<videoId>`) so a Spotify integration can coexist (`spotify:<trackId>`).
- Clerk users are mirrored into the `users` table on first authenticated request via `syncCurrentUser()`.
