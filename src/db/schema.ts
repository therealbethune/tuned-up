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
  // Hot path: /api/ratings rate-limit count(*) by (userId, updatedAt).
  // Without this index the per-user filter falls back to a scan within
  // the user partition because the user_idx is keyed on createdAt.
  index("ratings_user_updated_idx").on(t.userId, t.updatedAt),
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
  // Hot path: /feed loads "who I follow" — `WHERE followerId = ? AND
  // status = 'accepted'`. The PK starts with followerId so it works,
  // but a status-filtered index is much narrower for users following
  // many accounts with pending requests in the mix.
  index("follows_follower_idx").on(t.followerId, t.status),
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
  // Hot path: /feed "have I liked these?" check — filters by likerId
  // and a list of songs. The PK starts with ratingUserId so without
  // this index the planner has to scan all (rUid, sId) pairs.
  index("likes_liker_idx").on(t.likerId),
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

// Songs the user has bookmarked for later rating. Replaces the
// removed Spotify save-to-library flow with something that lives
// entirely inside Tuned Up. When the user rates a saved song, we
// drop the save row automatically (cleared in /api/ratings POST).
export const savedSongs = pgTable("saved_songs", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  songId: text("song_id").notNull().references(() => songs.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.songId] }),
  // /me/saved + the "is this saved?" check on the feed hit this.
  index("saved_songs_user_idx").on(t.userId, t.createdAt),
]);

// Content reports. UGC moderation flow required by Apple App Store
// Guideline 1.2 — users must be able to flag offensive content. The
// targetType + nullable target* columns let one table cover every
// flaggable surface (rating, comment, profile) without separate tables.
//   targetType: 'rating' | 'comment' | 'user'
//   reason:     short enum string ('spam' | 'harassment' | 'hate' | ...)
//   status:     'open' | 'reviewed' | 'dismissed'
export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull(),
  // For 'rating' + 'comment': the rating's owner. For 'user': the
  // reported account. For all three, useful for triage joins.
  targetUserId: text("target_user_id"),
  // Set on 'rating' + 'comment'; deep-links the report to the offending
  // post when staff review.
  targetSongId: text("target_song_id"),
  targetCommentId: text("target_comment_id"),
  reason: text("reason").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  // Triage queries scan newest open reports first.
  index("reports_status_idx").on(t.status, t.createdAt),
  // De-dupe: the same reporter can't pile on the same target.
  index("reports_reporter_target_idx").on(t.reporterId, t.targetType, t.targetUserId),
]);

// One row per (blocker, blocked) pair. App Store Guideline 1.2 requires
// users to be able to block abusive accounts. Blocking is one-way: the
// blocker stops seeing the blocked user's ratings/comments/profile and
// vice-versa (mirrored in feed/profile/comment filters).
export const blocks = pgTable("blocks", {
  blockerId: text("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  primaryKey({ columns: [t.blockerId, t.blockedId] }),
  // Reverse-direction lookup for mirrored hiding (blocked user shouldn't
  // see the blocker's content either).
  index("blocks_blocked_idx").on(t.blockedId),
]);

// Activity / notifications. One row per thing that should appear in
// the recipient's activity bell. type values currently in use:
//   follow         — actorId started following userId
//   comment        — actorId commented on userId's rating
//   reply          — actorId replied to userId's comment
//   like           — actorId liked userId's rating
//   mention        — actorId @-mentioned userId in a comment/review
//   rating_match   — actorId rated a song userId had also rated
//   rec_rated      — actorId rated a song userId had recommended to them
//   streak_3 / streak_7 / streak_30 / streak_60 / ... — milestone toasts
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
  // Speeds up the rating-delete + account-delete cleanup sweeps that
  // remove activity rows pointing at a now-deleted rating. Without it,
  // both sweeps fall back to a sequential scan of the activities table.
  index("activities_rating_user_idx").on(t.ratingUserId),
]);
