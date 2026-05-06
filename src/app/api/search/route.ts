import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { search, type ItemKind } from "@/lib/ytmusic";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const kindParam = (url.searchParams.get("kind") ?? "song").trim();
  const kind: ItemKind = kindParam === "album" ? "album" : "song";
  if (!q) return NextResponse.json({ results: [] });

  try {
    const results = await search(q, kind);
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
