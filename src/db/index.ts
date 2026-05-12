import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

// We support both NETLIFY_DATABASE_URL (legacy from the Netlify-managed
// integration) and DATABASE_URL (used for self-hosted Neon). Either works,
// and the order means a fresh deploy that's been migrated to self-hosting
// can drop NETLIFY_DATABASE_URL without breaking anything.
function getDb() {
  if (!_db) {
    const url =
      process.env.NETLIFY_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "";
    if (!url) {
      throw new Error(
        "DB connection URL missing: set NETLIFY_DATABASE_URL or DATABASE_URL",
      );
    }
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get(_t, prop) {
    return Reflect.get(getDb(), prop);
  },
});

export * from "./schema";
