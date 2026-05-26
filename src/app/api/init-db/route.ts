import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single source of truth for the production schema. We migrated off
// drizzle-kit's per-migration files (which had drifted) to one
// idempotent statement list — each statement uses IF NOT EXISTS / IF
// EXISTS so it's safe to re-run, and "already exists" errors are
// treated as success on POST. Add new columns/tables/indexes at the
// bottom; never edit historical statements.
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "users" (
    "id" text PRIMARY KEY NOT NULL,
    "username" text NOT NULL,
    "display_name" text,
    "image_url" text,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "songs" (
    "id" text PRIMARY KEY NOT NULL,
    "title" text NOT NULL,
    "artist" text NOT NULL,
    "album" text,
    "thumbnail" text,
    "duration_seconds" integer,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "ratings" (
    "user_id" text NOT NULL,
    "song_id" text NOT NULL,
    "score" integer NOT NULL,
    "review" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "ratings_user_id_song_id_pk" PRIMARY KEY("user_id","song_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "follows" (
    "follower_id" text NOT NULL,
    "followee_id" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "follows_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
  )`,
  `ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_users_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "ratings" ADD CONSTRAINT "ratings_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "follows_followee_idx" ON "follows" USING btree ("followee_id")`,
  `CREATE INDEX IF NOT EXISTS "ratings_user_idx" ON "ratings" USING btree ("user_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "ratings_song_idx" ON "ratings" USING btree ("song_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "users_username_idx" ON "users" USING btree ("username")`,
  `CREATE TABLE IF NOT EXISTS "activities" (
    "id" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "actor_id" text NOT NULL,
    "type" text NOT NULL,
    "song_id" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "read_at" timestamp
  )`,
  `ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "activities_user_idx" ON "activities" USING btree ("user_id","created_at")`,
  `CREATE TABLE IF NOT EXISTS "comments" (
    "id" text PRIMARY KEY NOT NULL,
    "rating_user_id" text NOT NULL,
    "song_id" text NOT NULL,
    "commenter_id" text NOT NULL,
    "body" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "comments" ADD CONSTRAINT "comments_commenter_id_users_id_fk" FOREIGN KEY ("commenter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "comments" ADD CONSTRAINT "comments_rating_fk" FOREIGN KEY ("rating_user_id","song_id") REFERENCES "public"."ratings"("user_id","song_id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "comments_target_idx" ON "comments" USING btree ("rating_user_id","song_id","created_at")`,
  `ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "parent_comment_id" text`,
  `CREATE INDEX IF NOT EXISTS "comments_parent_idx" ON "comments" USING btree ("parent_comment_id")`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp`,
  `CREATE TABLE IF NOT EXISTS "likes" (
    "rating_user_id" text NOT NULL,
    "song_id" text NOT NULL,
    "liker_id" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "likes_pk" PRIMARY KEY("rating_user_id","song_id","liker_id")
  )`,
  `ALTER TABLE "likes" ADD CONSTRAINT "likes_liker_id_users_id_fk" FOREIGN KEY ("liker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "likes" ADD CONSTRAINT "likes_rating_fk" FOREIGN KEY ("rating_user_id","song_id") REFERENCES "public"."ratings"("user_id","song_id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "likes_target_idx" ON "likes" USING btree ("rating_user_id","song_id")`,
  // Backfill: any user who's already rated something is grandfathered in.
  // Idempotent — only updates rows where onboarded_at is still null.
  `UPDATE "users" SET "onboarded_at" = "created_at" WHERE "onboarded_at" IS NULL AND EXISTS (SELECT 1 FROM "ratings" WHERE "ratings"."user_id" = "users"."id")`,
  // Newer columns added in later batches — all idempotent.
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_private" boolean NOT NULL DEFAULT false`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_streak_warn_date" text`,
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'song'`,
  `ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'accepted'`,
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "apple_music_url" text`,
  `CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "endpoint" text PRIMARY KEY NOT NULL,
    "user_id" text NOT NULL,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "dismissed_suggestions" (
    "viewer_id" text NOT NULL,
    "suggested_id" text NOT NULL,
    "dismissed_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "dismissed_suggestions_pk" PRIMARY KEY("viewer_id","suggested_id")
  )`,
  `ALTER TABLE "dismissed_suggestions" ADD CONSTRAINT "dismissed_suggestions_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "dismissed_suggestions" ADD CONSTRAINT "dismissed_suggestions_suggested_id_users_id_fk" FOREIGN KEY ("suggested_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE TABLE IF NOT EXISTS "recommendations" (
    "id" text PRIMARY KEY NOT NULL,
    "from_user_id" text NOT NULL,
    "to_user_id" text NOT NULL,
    "song_id" text NOT NULL,
    "message" text,
    "status" text NOT NULL DEFAULT 'pending',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_from_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_to_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "recommendations_to_idx" ON "recommendations" USING btree ("to_user_id","created_at")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "recommendations_unique" ON "recommendations" USING btree ("from_user_id","to_user_id","song_id")`,
  // Spotify track-id resolution cache on songs (so "Open in Spotify" is direct, not a search).
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "spotify_track_id" text`,
  // Streak caching for milestone activities + percentile compute.
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "current_streak" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "highest_streak_milestone" integer NOT NULL DEFAULT 0`,
  // Deep-link target for activity rows + push notifications. Set on
  // comment/like/mention/reply/rating_match/rec_rated; lets us route to
  // /r/<rating_owner>/<song_id> when the recipient isn't the rating owner.
  `ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "rating_user_id" text`,
  // follower-side index speeds up the feed's "followedIds" lookup.
  `CREATE INDEX IF NOT EXISTS "follows_follower_idx" ON "follows" USING btree ("follower_id","status")`,
  // Wave G — performance indexes added 2026-05-11 after Neon quota
  // incident. Each replaces a table scan within a partition.
  //   - ratings_user_updated_idx: rate-limit count(updatedAt) on POST.
  //   - likes_liker_idx: /feed "have I liked these?" check.
  //   - activities_unread_idx: partial index for the unread badge.
  `CREATE INDEX IF NOT EXISTS "ratings_user_updated_idx" ON "ratings" USING btree ("user_id","updated_at")`,
  `CREATE INDEX IF NOT EXISTS "likes_liker_idx" ON "likes" USING btree ("liker_id")`,
  `CREATE INDEX IF NOT EXISTS "activities_unread_idx" ON "activities" USING btree ("user_id") WHERE "read_at" IS NULL`,
  // Speeds up the rating-delete + account-delete cleanup sweeps (Wave S
  // + Wave BA) that DELETE activity rows by ratingUserId. Without this,
  // those sweeps scan the whole activities table.
  `CREATE INDEX IF NOT EXISTS "activities_rating_user_idx" ON "activities" USING btree ("rating_user_id")`,
  // Removed feature: sound_bites / reels. Drop dormant table (idempotent —
  // no-op if it was never created in this environment).
  `DROP TABLE IF EXISTS "sound_bites" CASCADE`,
  // Removed feature: per-user Spotify account linking. We only use
  // Spotify's app-credentials (catalog search) flow now, so the
  // refresh-token table is dead weight. CASCADE wipes the FK
  // constraint along with the table; idempotent re-runs are no-ops.
  `DROP TABLE IF EXISTS "spotify_accounts" CASCADE`,
  // UGC moderation tables. App Store Guideline 1.2 requires:
  //   - reports: users can flag offensive content (ratings/comments/users)
  //   - blocks: users can block abusive accounts and stop seeing them
  // Both tables are idempotent on re-run.
  `CREATE TABLE IF NOT EXISTS "reports" (
    "id" text PRIMARY KEY NOT NULL,
    "reporter_id" text NOT NULL,
    "target_type" text NOT NULL,
    "target_user_id" text,
    "target_song_id" text,
    "target_comment_id" text,
    "reason" text NOT NULL,
    "details" text,
    "status" text NOT NULL DEFAULT 'open',
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" USING btree ("status","created_at")`,
  `CREATE INDEX IF NOT EXISTS "reports_reporter_target_idx" ON "reports" USING btree ("reporter_id","target_type","target_user_id")`,
  `CREATE TABLE IF NOT EXISTS "blocks" (
    "blocker_id" text NOT NULL,
    "blocked_id" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "blocks_pk" PRIMARY KEY("blocker_id","blocked_id")
  )`,
  `ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "blocks_blocked_idx" ON "blocks" USING btree ("blocked_id")`,
  // Save-for-later pile (Wave BC bookmark feature). Composite PK so a
  // user can save a given song exactly once; the index supports the
  // /me/saved list (most-recent first per user).
  `CREATE TABLE IF NOT EXISTS "saved_songs" (
    "user_id" text NOT NULL,
    "song_id" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "saved_songs_pk" PRIMARY KEY("user_id","song_id")
  )`,
  `ALTER TABLE "saved_songs" ADD CONSTRAINT "saved_songs_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action`,
  `ALTER TABLE "saved_songs" ADD CONSTRAINT "saved_songs_song_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action`,
  `CREATE INDEX IF NOT EXISTS "saved_songs_user_idx" ON "saved_songs" USING btree ("user_id","created_at")`,
  // Per-category push notification preferences. All default true so
  // existing users don't silently lose notifications when this lands.
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_mentions" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_comments" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_likes" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_follows" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_recs" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_taste_matches" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notify_streak" boolean NOT NULL DEFAULT true`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "streak_freeze_tokens" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "genre" text`,
  `CREATE INDEX IF NOT EXISTS "songs_genre_idx" ON "songs" USING btree ("genre")`,
  `ALTER TABLE "ratings" ADD COLUMN IF NOT EXISTS "mood" text`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "cover_theme" text`,
  // Persistent iTunes preview URL cache on songs. Populated by
  // /api/preview-url on first lookup, then served directly via row
  // queries — kills the click-time network round-trip that was
  // breaking iOS Safari's gesture activation on cold first taps.
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "preview_url" text`,
  `ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "preview_checked" boolean NOT NULL DEFAULT false`,
  // Partial unique indexes that make duplicate activity notifications
  // impossible for the dedup-safe types. The runtime route handlers
  // pair these with `.onConflictDoNothing()` so simultaneous double-
  // taps + re-imports of historical activity rows fold into a single
  // row instead of multiplying. Required IF NOT EXISTS so the
  // idempotent re-run pattern works.
  `CREATE UNIQUE INDEX IF NOT EXISTS "activities_dedup_no_song"
    ON "activities" ("user_id", "actor_id", "type")
    WHERE "type" IN ('follow', 'follow_request')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "activities_dedup_with_song"
    ON "activities" ("user_id", "actor_id", "type", "song_id")
    WHERE "type" IN ('like', 'recommendation', 'streak_milestone', 'rating_match', 'rec_rated')
      AND "song_id" IS NOT NULL`,
];

// Auth: requires INIT_DB_TOKEN in the Authorization header (set as a Netlify env var).
export async function POST(req: Request) {
  const expected = process.env.INIT_DB_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "INIT_DB_TOKEN not set on server" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    return NextResponse.json({ error: "DB url missing" }, { status: 500 });
  }
  const sql = neon(url);
  const results: { ok: boolean; preview: string; error?: string }[] = [];
  for (const stmt of STATEMENTS) {
    try {
      await sql.query(stmt);
      results.push({ ok: true, preview: stmt.slice(0, 60).replace(/\s+/g, " ") });
    } catch (e) {
      const msg = (e as Error).message;
      const benign = /already exists|duplicate/i.test(msg);
      results.push({
        ok: benign,
        preview: stmt.slice(0, 60).replace(/\s+/g, " "),
        error: benign ? undefined : msg,
      });
    }
  }

  return NextResponse.json({ applied: results.length, results });
}
