import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-shot cleanup for orphaned sound-bite audio blobs left over after
// the reels feature was removed. The DB table is already dropped so every
// blob in the "sound-bites" store is now an orphan. Deletes them all.
//
// POST /api/admin/cleanup-sound-bites with Authorization: Bearer <INIT_DB_TOKEN>
// Optional ?dry=1 to preview without deleting.
export async function POST(req: Request) {
  const expected = process.env.INIT_DB_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "INIT_DB_TOKEN not set" }, { status: 500 });
  }
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (got !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";

  try {
    const store = getStore({ name: "sound-bites" });
    const list = await store.list();
    const keys = list.blobs?.map((b) => b.key) ?? [];

    if (!dry) {
      await Promise.all(keys.map((k) => store.delete(k)));
    }

    return NextResponse.json({ ok: true, deleted: keys.length, dry, keys: keys.slice(0, 20) });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "cleanup failed" },
      { status: 500 },
    );
  }
}
