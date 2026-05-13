import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { reportError } from "@/lib/report-error";
import { memoryRateLimited, LIMITS } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/account/notify
// Body: partial map of { mentions, comments, likes, follows, recs,
// taste_matches, streak } → boolean. Anything not present is left
// alone, so the client can do incremental toggles without round-
// tripping the full preference set.
const FIELD_MAP = {
  mentions: "notifyMentions",
  comments: "notifyComments",
  likes: "notifyLikes",
  follows: "notifyFollows",
  recs: "notifyRecs",
  taste_matches: "notifyTasteMatches",
  streak: "notifyStreak",
} as const;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limited = memoryRateLimited(LIMITS.ACCOUNT, `notify:${userId}`);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const patch: Record<string, boolean> = {};
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (key in b && typeof b[key] === "boolean") {
      patch[column] = b[key] as boolean;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  try {
    await db.update(users).set(patch).where(eq(users.id, userId));
  } catch (e) {
    reportError(e, "account/notify PATCH");
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
