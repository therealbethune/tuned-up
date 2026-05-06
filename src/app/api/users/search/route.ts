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

  const pattern = `%${q}%`;

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
