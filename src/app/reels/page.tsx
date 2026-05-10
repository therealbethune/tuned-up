import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, soundBites, songs, users, ratings, follows } from "@/db";
import { ReelsViewer } from "./ReelsViewer";

export const dynamic = "force-dynamic";

// Fullscreen swipeable feed of sound bites — swipe up for next, autoplay
// each clip alongside its rating card. Friends-first ordering.
export default async function ReelsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const followedRows = await db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(and(eq(follows.followerId, userId), eq(follows.status, "accepted")));
  const followedIds = followedRows.map((r) => r.id);
  followedIds.push(userId);

  // Pull friends' bites first, then anyone else's. Limit aggressively so the
  // feed stays snappy.
  const FRIEND_LIMIT = 30;
  const GLOBAL_LIMIT = 30;

  const friendBites = followedIds.length
    ? await db
        .select({
          id: soundBites.id,
          songId: soundBites.songId,
          audioUrl: soundBites.audioUrl,
          durationMs: soundBites.durationMs,
          createdAt: soundBites.createdAt,
          username: users.username,
          displayName: users.displayName,
          imageUrl: users.imageUrl,
          biteUserId: soundBites.userId,
          title: songs.title,
          artist: songs.artist,
          thumbnail: songs.thumbnail,
        })
        .from(soundBites)
        .innerJoin(users, eq(users.id, soundBites.userId))
        .innerJoin(songs, eq(songs.id, soundBites.songId))
        .where(inArray(soundBites.userId, followedIds))
        .orderBy(desc(soundBites.createdAt))
        .limit(FRIEND_LIMIT)
    : [];

  const friendIdsSet = new Set(friendBites.map((b) => b.id));

  const globalBites = await db
    .select({
      id: soundBites.id,
      songId: soundBites.songId,
      audioUrl: soundBites.audioUrl,
      durationMs: soundBites.durationMs,
      createdAt: soundBites.createdAt,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      biteUserId: soundBites.userId,
      title: songs.title,
      artist: songs.artist,
      thumbnail: songs.thumbnail,
    })
    .from(soundBites)
    .innerJoin(users, eq(users.id, soundBites.userId))
    .innerJoin(songs, eq(songs.id, soundBites.songId))
    .orderBy(desc(soundBites.createdAt))
    .limit(GLOBAL_LIMIT);

  const merged = [
    ...friendBites,
    ...globalBites.filter((b) => !friendIdsSet.has(b.id)),
  ];

  // Lookup the rater's score for each bite (so the card shows context).
  const songUserPairs = merged.map((b) => ({ userId: b.biteUserId, songId: b.songId }));
  const scoreMap = new Map<string, number>();
  if (songUserPairs.length) {
    const allUserIds = Array.from(new Set(songUserPairs.map((p) => p.userId)));
    const allSongIds = Array.from(new Set(songUserPairs.map((p) => p.songId)));
    const rows = await db
      .select({
        userId: ratings.userId,
        songId: ratings.songId,
        score: ratings.score,
      })
      .from(ratings)
      .where(
        and(
          inArray(ratings.userId, allUserIds),
          inArray(ratings.songId, allSongIds),
        ),
      );
    for (const r of rows) {
      scoreMap.set(`${r.userId}::${r.songId}`, r.score);
    }
  }

  const items = merged.map((b) => ({
    ...b,
    score: scoreMap.get(`${b.biteUserId}::${b.songId}`) ?? null,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
  }));

  return <ReelsViewer items={items} />;
}
