// Signs and caches a MusicKit developer token (JWT signed with ES256).
// Apple Music's Developer Token JWT spec:
//   header: { alg: 'ES256', kid: <key id> }
//   payload: { iss: <team id>, iat: <now>, exp: <up to 180 days> }
// Signed with the .p8 private key downloaded from developer.apple.com.
//
// Env vars expected:
//   APPLE_MUSIC_TEAM_ID    — 10-char Team ID (e.g. D9N5VA5UDH)
//   APPLE_MUSIC_KEY_ID     — 10-char Key ID  (e.g. ABC123DEFG)
//   APPLE_MUSIC_PRIVATE_KEY — full PEM, including -----BEGIN PRIVATE KEY-----
//
// The .p8 file Apple gives you IS the PKCS#8 PEM. Paste contents into
// the env var (Netlify accepts multi-line values; or replace newlines
// with \n if needed and we'll un-escape them here).

import { SignJWT, importPKCS8 } from "jose";

const TEAM_ID = process.env.APPLE_MUSIC_TEAM_ID || "";
const KEY_ID = process.env.APPLE_MUSIC_KEY_ID || "";
const PRIVATE_KEY_RAW = process.env.APPLE_MUSIC_PRIVATE_KEY || "";

// Tokens last 6 months max; we rotate at 5 months. Cache in module memory.
let cached: { token: string; expiresAt: number } | null = null;

function unescapePem(raw: string): string {
  // If the env var was pasted with literal \n, convert to real newlines.
  return raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : raw;
}

export function appleMusicConfigured(): boolean {
  return Boolean(TEAM_ID && KEY_ID && PRIVATE_KEY_RAW);
}

export async function getAppleMusicDeveloperToken(): Promise<string> {
  if (!appleMusicConfigured()) {
    throw new Error("Apple Music not configured (missing env vars)");
  }
  // 24h slack so we never serve a token that's about to expire.
  if (cached && Date.now() < cached.expiresAt - 24 * 60 * 60 * 1000) {
    return cached.token;
  }
  const pem = unescapePem(PRIVATE_KEY_RAW);
  const privateKey = await importPKCS8(pem, "ES256");

  const fiveMonths = 60 * 60 * 24 * 30 * 5; // seconds
  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: KEY_ID })
    .setIssuer(TEAM_ID)
    .setIssuedAt(now)
    .setExpirationTime(now + fiveMonths)
    .sign(privateKey);

  cached = { token, expiresAt: (now + fiveMonths) * 1000 };
  return token;
}
