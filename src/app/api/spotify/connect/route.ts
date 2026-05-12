import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { randomBytes, createHmac } from "node:crypto";
import { SPOTIFY_LINK_SCOPES, spotifyServerConfigured } from "@/lib/spotify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_URL = "https://accounts.spotify.com/authorize";

// Sign the state param so the callback can verify it came from us and
// recover the user id. Layout: `userId.nonce.issuedAtMs.sig` — the
// timestamp gives the callback a TTL check (states older than ~10 min
// are rejected) which prevents replay of an intercepted state long
// after the original flow completed.
//
// Secret: prefers SPOTIFY_STATE_SECRET, falls back to INIT_DB_TOKEN
// so existing deploys keep working without a re-env step. New deploys
// should set SPOTIFY_STATE_SECRET so OAuth state isn't sharing a key
// with migration auth + admin endpoints + cron — independent rotation.
function stateSecret(): string {
  return process.env.SPOTIFY_STATE_SECRET || process.env.INIT_DB_TOKEN || "";
}

function signState(userId: string): string {
  const nonce = randomBytes(8).toString("hex");
  const issuedAt = Date.now().toString(36);
  const payload = `${userId}.${nonce}.${issuedAt}`;
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

// GET /api/spotify/connect — kicks off the OAuth flow.
// Optional ?return=/path query to redirect to after success.
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!spotifyServerConfigured()) {
    return NextResponse.json({ error: "Spotify is not configured on the server" }, { status: 500 });
  }
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";

  const url = new URL(req.url);
  // Strict allowlist on returnTo so a malicious link can't bounce the user
  // off-site after auth. Must be a relative path starting with "/" and not
  // contain "://" (protocol) or "//" (protocol-relative URL).
  const rawReturn = url.searchParams.get("return") || "/settings";
  const returnTo =
    rawReturn.startsWith("/") &&
    !rawReturn.startsWith("//") &&
    !rawReturn.includes("://") &&
    rawReturn.length < 200
      ? rawReturn
      : "/settings";
  const redirectUri = `${url.origin}/api/spotify/callback`;

  // Stash the return-to path inside the state so the callback can use it.
  const state = `${signState(userId)}|${encodeURIComponent(returnTo)}`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_LINK_SCOPES,
    state,
    // show_dialog=true forces Spotify to actually show the consent screen
    // even if the user has previously authorized. Required so that a
    // re-connect after fixing dev-mode User Management (or after we add
    // new scopes) actually re-evaluates the authorization grant —
    // otherwise Spotify silently re-uses the prior grant and the token
    // stays bound to the old ACL state.
    show_dialog: "true",
  });
  return NextResponse.redirect(`${AUTH_URL}?${params.toString()}`);
}
