import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDb() {
  if (!_db) {
    const sql = neon();
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
