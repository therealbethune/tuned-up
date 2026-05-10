import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { ilike, or, sql, desc, eq, count } from "drizzle-orm";
import { db, users, ratings } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  if (q.length > 64) return NextResponse.json({ results: [] });

  // Escape LIKE wildcards so a user typing "ab_c" doesn't match "abXc"
  // (where X is any char). Backslash is the default escape in Postgres.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${safe}%`;

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      ratingsCount: count(ratings.userId),
    })
    .from(users)
    .leftJoin(ratings, eq(ratings.userId, users.id))
    .where(or(ilike(users.username, pattern), ilike(users.displayName, pattern)))
    .groupBy(users.id)
    .orderBy(desc(sql`count(${ratings.userId})`))
    .limit(20);

  return NextResponse.json({ results: rows });
}
