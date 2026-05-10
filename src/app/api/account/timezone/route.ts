import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";

export const runtime = "nodejs";

// Best-effort timezone sync from the client. We just need a stable IANA
// zone string so the cron can compute the user's local time for the
// streak-warning push.
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { timezone } = (await req.json().catch(() => ({}))) ?? {};
  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 64) {
    return NextResponse.json({ error: "invalid timezone" }, { status: 400 });
  }
  // Quick sanity-check the IANA pattern (e.g. "America/New_York", "UTC").
  if (!/^[A-Za-z_/+\-0-9]+$/.test(timezone)) {
    return NextResponse.json({ error: "invalid timezone" }, { status: 400 });
  }
  // Actually try to construct a DateTimeFormat with the value — the spec
  // throws a RangeError on unknown IANA names so this is the canonical
  // "is it a real timezone" check (catches things like "Foo/Bar" that
  // pass the regex but aren't real zones).
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: "unknown timezone" }, { status: 400 });
  }

  await db.update(users).set({ timezone }).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
