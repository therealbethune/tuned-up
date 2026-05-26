import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { search, type ItemKind } from "@/lib/ytmusic";
import { reportError } from "@/lib/report-error";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kindParam = (url.searchParams.get("kind") ?? "song").trim();
  const kind: ItemKind = kindParam === "album" ? "album" : "song";
  if (!q) return NextResponse.json({ results: [] });
  // Cap query length so a misbehaving client can't push multi-KB
  // queries to YouTube Music through us. 200 chars is well above any
  // real "title artist album" search; YTM rejects long queries anyway.
  if (q.length > 200) {
    return NextResponse.json({ error: "query too long" }, { status: 400 });
  }

  try {
    const results = await search(q, kind);
    return NextResponse.json({ results });
  } catch (e) {
    // Log the upstream YTM error to Sentry + Netlify so we can diagnose
    // shape changes, but don't leak the internal message to the client
    // (could contain stack frames or scraper internals).
    reportError(e, "search ytmusic");
    return NextResponse.json(
      { error: "Search is having a hiccup. Try again in a moment." },
      { status: 502 },
    );
  }
}
