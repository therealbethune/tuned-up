import { db, songs, ratings, users, follows } from "./src/db";
import { eq, inArray, desc } from "drizzle-orm";

const sql1 = db.insert(songs).values({
  id: "1", title: "T", artist: "A"
}).onConflictDoUpdate({
  target: songs.id,
  set: { title: "T2" }
}).toSQL();
console.log("SQL1:", sql1);

const sql2 = db.insert(ratings).values({
  userId: "u1", songId: "s1", score: 100, createdAt: new Date(), updatedAt: new Date()
}).onConflictDoUpdate({
  target: [ratings.userId, ratings.songId],
  set: { score: 50 }
}).toSQL();
console.log("SQL2:", sql2);

const sql3 = db.select({ score: ratings.score }).from(ratings).where(inArray(ratings.userId, ["u1", "u2"])).toSQL();
console.log("SQL3:", sql3);
