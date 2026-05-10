import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, spotifyAccounts } from "@/db";
import { exchangeCodeForUserTokens, fetchSpotifyMe } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Verifies the state HMAC and returns the userId. Returns null if invalid.
function verifyState(state: string): { userId: string; returnTo: string } | null {
  // state = "userId.nonce.sig|<encoded returnTo>"
  const [signed, encReturn] = state.split("|");
  if (!signed) return null;
  const parts = signed.split(".");
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  const payload = `${userId}.${nonce}`;
  const secret = process.env.INIT_DB_TOKEN || "";
  const expected = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  // Defense-in-depth: even though /connect already sanitized this, validate
  // again on the callback so a tampered cookie / out-of-flow request can't
  // bounce the user off-site.
  const decoded = encReturn ? decodeURIComponent(encReturn) : "/settings";
  const returnTo =
    decoded.startsWith("/") &&
    !decoded.startsWith("//") &&
    !decoded.includes("://") &&
    decoded.length < 200
      ? decoded
      : "/settings";
  return { userId, returnTo };
}

// GET /api/spotify/callback?code=...&state=...
// Exchanges the auth code for tokens, stores them on the user's row, and
// redirects back to the page that started the flow.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") || "";
  const err = url.searchParams.get("error");

  if (err) {
    return NextResponse.redirect(`${url.origin}/settings?spotify=error&reason=${encodeURIComponent(err)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${url.origin}/settings?spotify=error&reason=missing_code`);
  }
  const verified = verifyState(state);
  if (!verified) {
    return NextResponse.redirect(`${url.origin}/settings?spotify=error&reason=bad_state`);
  }

  try {
    const redirectUri = `${url.origin}/api/spotify/callback`;
    const tokens = await exchangeCodeForUserTokens(code, redirectUri);
    const me = await fetchSpotifyMe(tokens.accessToken);

    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

    // Upsert by user id (Drizzle's onConflictDoUpdate so re-linking works).
    await db
      .insert(spotifyAccounts)
      .values({
        userId: verified.userId,
        spotifyUserId: me.id,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        expiresAt,
        scope: tokens.scope,
      })
      .onConflictDoUpdate({
        target: spotifyAccounts.userId,
        set: {
          spotifyUserId: me.id,
          refreshToken: tokens.refreshToken,
          accessToken: tokens.accessToken,
          expiresAt,
          scope: tokens.scope,
        },
      });

    return NextResponse.redirect(`${url.origin}${verified.returnTo}?spotify=connected`);
  } catch (e) {
    const msg = (e as Error).message || "exchange_failed";
    return NextResponse.redirect(
      `${url.origin}/settings?spotify=error&reason=${encodeURIComponent(msg.slice(0, 60))}`,
    );
  }
}
