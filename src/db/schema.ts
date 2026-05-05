import { pgTable, text, integer, timestamp, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [uniqueIndex("users_username_idx").on(t.username)]);

export const songs = pgTable("songs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  thumbnail: text("thumbnail"),
  durationSeconds: integer("duration_seconds"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ratings = pgTable("ratings", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.songId] }),
  index("ratings_user_idx").on(t.userId, t.createdAt),
  index("ratings_song_idx").on(t.songId),
]);

export const follows = pgTable("follows", {
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followeeId] }),
  index("follows_followee_idx").on(t.followeeId),
]);
