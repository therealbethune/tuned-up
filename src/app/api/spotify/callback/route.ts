import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, spotifyAccounts } from "@/db";
import { exchangeCodeForUserTokens, fetchSpotifyMe } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard ceiling on how long a Spotify-flow state token stays valid. The
// happy-path OAuth dance is <30s; 10 minutes is generous and still cuts
// off replay of an intercepted state from being useful indefinitely.
const STATE_TTL_MS = 10 * 60 * 1000;

// Same secret resolver as /api/spotify/connect — keep these in lockstep
// or the HMAC won't match.
function stateSecret(): string {
  return process.env.SPOTIFY_STATE_SECRET || process.env.INIT_DB_TOKEN || "";
}

// Verifies the state HMAC and returns the userId. Returns null if invalid.
function verifyState(state: string): { userId: string; returnTo: string } | null {
  // state = "userId.nonce.issuedAtMs.sig|<encoded returnTo>"
  // Backward-compat: also accepts the older "userId.nonce.sig" layout
  // so a flow that started before this deploy can still complete.
  const [signed, encReturn] = state.split("|");
  if (!signed) return null;
  const parts = signed.split(".");
  let userId: string;
  let nonce: string;
  let issuedAt: string | null;
  let sig: string;
  if (parts.length === 4) {
    [userId, nonce, issuedAt, sig] = parts;
  } else if (parts.length === 3) {
    [userId, nonce, sig] = parts;
    issuedAt = null;
  } else {
    return null;
  }
  const payload = issuedAt ? `${userId}.${nonce}.${issuedAt}` : `${userId}.${nonce}`;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  // TTL check (only applies to states that carry a timestamp — the
  // pre-rollout layout is treated as expired-eligible for replay but
  // those tokens age out as soon as users complete their pending flows).
  if (issuedAt) {
    const issued = parseInt(issuedAt, 36);
    if (!Number.isFinite(issued)) return null;
    if (Date.now() - issued > STATE_TTL_MS) return null;
  }
  // Defense-in-depth: even though /connect already sanitized this,
  // validate again on the callback. Use a strict allowlist of routes
  // the flow can legitimately end on, rather than character-level
  // checks (which let oddities like backslash, %2F%2F, and other
  // browser-quirky variants through).
  const ALLOWED_RETURN_PREFIXES = ["/settings", "/welcome", "/me", "/feed"];
  const decoded = encReturn ? decodeURIComponent(encReturn) : "/settings";
  const returnTo =
    decoded.length < 200 &&
    ALLOWED_RETURN_PREFIXES.some(
      (p) => decoded === p || decoded.startsWith(p + "?") || decoded.startsWith(p + "/"),
    )
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
