#!/usr/bin/env node
// Post-build smoke test. Boots the production server on a random
// port, hits the routes most likely to expose a "compiles fine, 500s
// at SSR" class of regression, then kills the server.
//
// The /feed Clerk-child bug (commit c1ca1cd → fix in 7064277) was
// EXACTLY this class: TypeScript clean, build succeeded, every test
// passed, but the moment a real request rendered SignedOutNav the
// Children.only assertion threw at runtime.
//
// Routes we hit (all reachable without auth):
//   - /            (logged-out landing → renders SignedOutNav)
//   - /discover    (renders friend recs + trending; data queries run)
//
// Any 5xx fails the run. 4xx is fine — that's just "not authorized"
// or "not found", not a server bug.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4399;
const ROUTES = [
  { path: "/", mustInclude: "Tuned Up" },
  { path: "/discover", mustInclude: "Tuned Up" },
];

// Boot `next dev` rather than `next start` so we don't require a
// `.env.local` with real Clerk keys to run smoke. Clerk falls back
// to keyless mode in dev, and the bug class we care about (SSR-time
// throws like the Children.only assertion) surfaces identically in
// dev and prod — `next dev` caught the exact regression that
// motivated this script.
const child = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env },
});

let killed = false;
function shutdown(code) {
  if (killed) return;
  killed = true;
  try { child.kill("SIGTERM"); } catch { /* nothing */ }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

async function waitForReady() {
  // Poll the server with a short timeout per attempt. Total budget
  // ~30 seconds — Next can take a bit to warm up the first request.
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`, {
        signal: AbortSignal.timeout(2000),
      });
      // Any response (including a 5xx — we'll catch it in the real
      // run below) means the server is accepting requests.
      void res;
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error("smoke: server didn't come up in 30s");
}

async function run() {
  await waitForReady();
  let failed = false;
  for (const r of ROUTES) {
    const res = await fetch(`http://127.0.0.1:${PORT}${r.path}`, {
      // Don't follow redirects automatically — a 5xx hidden behind a
      // redirect chain still fails us.
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 500) {
      const body = await res.text().catch(() => "");
      const errMsg =
        body.match(/data-next-error-message="([^"]{0,300})/)?.[1] ?? "";
      console.error(
        `✘ ${r.path} returned ${res.status}` +
          (errMsg ? `\n  Error: ${errMsg.replace(/&#x27;/g, "'")}` : ""),
      );
      failed = true;
      continue;
    }
    // 200 — verify the body contains the marker so we know the page
    // actually rendered, not just a passthrough.
    if (res.status < 400 && r.mustInclude) {
      const body = await res.text();
      if (!body.includes(r.mustInclude)) {
        console.error(
          `✘ ${r.path} returned ${res.status} but body didn't contain "${r.mustInclude}"`,
        );
        failed = true;
        continue;
      }
    }
    console.log(`✓ ${r.path} → ${res.status}`);
  }
  if (failed) {
    console.error("\nSmoke test failed.");
    shutdown(1);
  } else {
    console.log("\n✓ Smoke test passed.");
    shutdown(0);
  }
}

run().catch((e) => {
  console.error("smoke: error", e);
  shutdown(1);
});
