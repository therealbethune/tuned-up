import { db, songs, ratings, users, follows } from "./src/db";
import { eq, inArray, desc } from "drizzle-orm";

const q = db
  .select({
    score: ratings.score,
    review: ratings.review,
    createdAt: ratings.createdAt,
    songId: ratings.songId,
    title: songs.title,
    artist: songs.artist,
    album: songs.album,
    thumbnail: songs.thumbnail,
    username: users.username,
    displayName: users.displayName,
    imageUrl: users.imageUrl,
  })
  .from(ratings)
  .innerJoin(songs, eq(ratings.songId, songs.id))
  .innerJoin(users, eq(ratings.userId, users.id))
  .where(inArray(ratings.userId, ["u1"]))
  .orderBy(desc(ratings.createdAt))
  .limit(50);

console.log(q.toSQL());
