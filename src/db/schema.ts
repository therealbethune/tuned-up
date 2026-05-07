import { pgTable, text, integer, timestamp, boolean, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  onboardedAt: timestamp("onboarded_at"),
  isPrivate: boolean("is_private").notNull().default(false),
}, (t) => [uniqueIndex("users_username_idx").on(t.username)]);

// 'song' | 'album'. The table name is historical — these are really
// "rateable items"; album rows just have kind='album' and reuse the column.
export const songs = pgTable("songs", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("song"),
  title: text("title").notNull(),
  artist: text("artist").notNull(),
  album: text("album"),
  thumbnail: text("thumbnail"),
  durationSeconds: integer("duration_seconds"),
  appleMusicUrl: text("apple_music_url"),
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

// status: 'accepted' for normal follows, 'pending' when the target is
// a private profile and hasn't yet accepted the request.
export const follows = pgTable("follows", {
  followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("accepted"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followeeId] }),
  index("follows_followee_idx").on(t.followeeId),
]);

// Web Push subscriptions. One row per (user, browser/device) combo. The
// endpoint is unique per subscription; deleting it on a 410 Gone response
// from the push service is how we clean up stale ones.
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("push_subscriptions_user_idx").on(t.userId),
]);

// Activity / notifications. type='follow' means actorId followed userId.
// Future types: 'rating_match' (actorId rated a song userId also rated), etc.
// A like on someone's rating. Composite key prevents duplicates;
// toggling is delete-then-insert.
export const likes = pgTable("likes", {
  ratingUserId: text("rating_user_id").notNull(),
  songId: text("song_id").notNull(),
  likerId: text("liker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.ratingUserId, t.songId, t.likerId] }),
  index("likes_target_idx").on(t.ratingUserId, t.songId),
]);

// A comment on someone's rating of a song. Targets the (userId, songId)
// composite primary key of `ratings`.
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  ratingUserId: text("rating_user_id").notNull(),
  songId: text("song_id").notNull(),
  commenterId: text("commenter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("comments_target_idx").on(t.ratingUserId, t.songId, t.createdAt),
]);

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  songId: text("song_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, (t) => [
  index("activities_user_idx").on(t.userId, t.createdAt),
]);
