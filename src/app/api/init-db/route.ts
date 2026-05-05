import { NextResponse } from "next/server";
import { neon } from "@netlify/neon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inline schema (same as drizzle/0000_init.sql). Safe to run multiple times —
// "already exists" errors are treated as success.
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

  const sql = neon();
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

export async function GET() {
  return NextResponse.json({ hint: "POST with Authorization: Bearer <INIT_DB_TOKEN>" });
}
