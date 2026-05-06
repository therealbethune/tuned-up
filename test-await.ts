import { db, users } from "./src/db";
async function run() {
  try {
    await db.select().from(users).limit(1);
    console.log("SUCCESS");
  } catch(e) {
    console.error("ERROR:", e);
  }
}
run();
