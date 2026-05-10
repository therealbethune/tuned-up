import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, pushSubscriptions } from "@/db";

export const runtime = "nodejs";

// Body: { endpoint, keys: { p256dh, auth } } — the JSON shape returned by
// PushManager.subscribe()'s toJSON.
//
// Security note: the previous version `onConflictDoUpdate`'d any existing
// row with the new userId, which let an attacker hijack another user's
// subscription endpoint by re-POSTing it. We now only update if the
// existing row already belongs to the same user — otherwise we treat the
// duplicate as a fresh subscription for the new user, preserving the
// other user's ability to receive pushes (push services use opaque keys,
// so different users practically can't share endpoints, but defence in
// depth).
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  const p256dh: string | undefined = body?.keys?.p256dh;
  const authKey: string | undefined = body?.keys?.auth;

  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  if (endpoint.length > 2048 || p256dh.length > 256 || authKey.length > 256) {
    return NextResponse.json({ error: "invalid subscription size" }, { status: 400 });
  }

  // Look up the existing row (if any) to enforce ownership.
  const [existing] = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (existing && existing.userId !== userId) {
    // Another user owns this endpoint. Refuse — don't hijack.
    return NextResponse.json({ error: "endpoint owned by another user" }, { status: 409 });
  }

  await db
    .insert(pushSubscriptions)
    .values({ endpoint, userId, p256dh, auth: authKey })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      // Only the keys can rotate; userId stays pinned to the original owner.
      set: { p256dh, auth: authKey },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const endpoint: string | undefined = body?.endpoint;
  if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });

  // Only the owner of the endpoint can delete it.
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.endpoint, endpoint),
        eq(pushSubscriptions.userId, userId),
      ),
    );
  return NextResponse.json({ ok: true });
}
