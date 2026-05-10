import { NextResponse } from "next/server";
import { getStore } from "@netlify/blobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sound-bites/play?key=<userId>/<id>.webm
// Streams the blob back as audio/webm. We don't expose Netlify Blobs URLs
// directly because they require store auth — instead we proxy through here.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  // Tight pattern check: <uuid-ish>/<uuid-ish>.webm  (no path traversal).
  if (!/^[\w-]{4,80}\/[\w-]{4,80}\.webm$/.test(key)) {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }
  try {
    const store = getStore({ name: "sound-bites" });
    const blob = await store.get(key, { type: "arrayBuffer" });
    if (!blob) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(blob, {
      status: 200,
      headers: {
        "content-type": "audio/webm",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
