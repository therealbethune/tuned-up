#!/usr/bin/env node
// Static check: catch the Clerk single-child gotcha that 500'd /feed in
// commit c1ca1cd and was fixed in 7064277.
//
// Clerk 6/7's <SignInButton>, <SignUpButton>, and <SignOutButton> all
// enforce React.Children.only on their child. Under React 19 + Next.js
// 16 + Turbopack the JSX whitespace between the wrapper tag and an
// inner <button> is preserved as an extra text child, blowing up
// every server-rendered page that ships SignedOutNav (i.e. all of them).
//
// This script scans .tsx files for <SignInButton…> / <SignUpButton…> /
// <SignOutButton…> openings and fails if the child is NOT a plain text
// span (e.g. it contains nested elements). The only safe usage is:
//
//   <SignInButton>Sign in</SignInButton>
//   <SignUpButton forceRedirectUrl="/welcome">Get started</SignUpButton>
//
// Style the rendered button via CSS (.clerk-nav / .clerk-landing-primary).
//
// Exit 1 on first finding; 0 otherwise.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const TARGETS = ["SignInButton", "SignUpButton", "SignOutButton"];

let failed = false;

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) yield* walk(full);
    else if (full.endsWith(".tsx")) yield full;
  }
}

for await (const file of walk(ROOT)) {
  const text = await readFile(file, "utf8");
  for (const tag of TARGETS) {
    // Find each opening of <Tag…> and inspect what's between it and
    // its matching </Tag>. We rely on a simple line-by-line scan plus
    // depth tracking; React JSX nesting beyond the immediate child is
    // fine — we only care about what's at depth 1 inside the wrapper.
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      const inner = m[1];
      // Plain text body? → safe (Clerk wraps in default <button>).
      // We treat "no JSX-like opening tag" as plain text. This also
      // lets `&apos;`, `{variable}`, etc. through, because none of
      // those are an element child.
      if (!/<[a-zA-Z]/.test(inner)) continue;

      // Has an element child. Reject — this is the broken pattern.
      const lineNo = text.slice(0, m.index).split("\n").length;
      const relFile = file.replace(ROOT + "/", "src/");
      console.error(
        `${relFile}:${lineNo}  <${tag}> wraps an element child.\n` +
          `  Clerk's React.Children.only assertion fails on this in React 19.\n` +
          `  Use plain text: <${tag}>Label</${tag}> and style via CSS (.clerk-nav / .clerk-landing-primary).`,
      );
      failed = true;
    }
  }
}

if (failed) {
  console.error("\n✘ Clerk-button check failed.");
  process.exit(1);
}
console.log("✓ Clerk-button check passed.");
