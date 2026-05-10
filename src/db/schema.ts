import { pgTable, text, integer, timestamp, boolean, primaryKey, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  onboardedAt: timestamp("onboarded_at"),
  isPrivate: boolean("is_private").notNull().default(false),
  timezone: text("timezone"),
  lastStreakWarnDate: text("last_streak_warn_date"),
  // Cached current streak length, refreshed on every new rating. Lets us
  // compute "top X% of users" without recomputing every streak on each load.
  currentStreak: integer("current_streak").notNull().default(0),
  // Highest milestone (in days) we've already announced for this user. Used
  // to make the milestone-activity insert idempotent — only fire when the
  // streak crosses a NEW threshold (7/14/30/60/100/365).
  highestStreakMilestone: integer("highest_streak_milestone").notNull().default(0),
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
  // Resolved Spotify track id (just the bare id, no `spotify:` prefix). Set
  // once via the Spotify Search API the first time we need a deep link.
  spotifyTrackId: text("spotify_track_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per user who has linked their Spotify account. Stores the
// long-lived refresh token plus a cached access token; helpers in
// `lib/spotify-server.ts` auto-refresh expired tokens.
export const spotifyAccounts = pgTable("spotify_accounts", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  spotifyUserId: text("spotify_user_id").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at"),
  scope: text("scope").notNull(),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
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

// One user recommending a song to another. status: 'pending' | 'rated' |
// 'dismissed'. Rating the song flips the status to 'rated' automatically.
export const recommendations = pgTable("recommendations", {
  id: text("id").primaryKey(),
  fromUserId: text("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toUserId: text("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull(),
  message: text("message"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("recommendations_to_idx").on(t.toUserId, t.createdAt),
  uniqueIndex("recommendations_unique").on(t.fromUserId, t.toUserId, t.songId),
]);

// Tracks who the viewer has explicitly dismissed from their suggested
// friends list, so we don't re-show them.
export const dismissedSuggestions = pgTable("dismissed_suggestions", {
  viewerId: text("viewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  suggestedId: text("suggested_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.viewerId, t.suggestedId] }),
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
// composite primary key of `ratings`. parentCommentId is null for top-level
// comments and set for replies — replies always live one level deep (a
// reply to a reply re-parents to the same top-level).
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  ratingUserId: text("rating_user_id").notNull(),
  songId: text("song_id").notNull(),
  commenterId: text("commenter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentCommentId: text("parent_comment_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("comments_target_idx").on(t.ratingUserId, t.songId, t.createdAt),
  index("comments_parent_idx").on(t.parentCommentId),
]);

export const activities = pgTable("activities", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actorId: text("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  songId: text("song_id"),
  // Who OWNS the rating this activity is about. Set for comment / like /
  // mention / reply / rating_match / rec_rated. Lets the activity row and
  // push notification deep-link to the right /r/<owner>/<songId> page —
  // critical when the recipient (e.g. a mentioned user) isn't the rating
  // owner and the rating wouldn't appear on their own feed.
  ratingUserId: text("rating_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
}, (t) => [
  index("activities_user_idx").on(t.userId, t.createdAt),
]);
