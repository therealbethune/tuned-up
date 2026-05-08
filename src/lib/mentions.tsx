import Link from "next/link";
import type { ReactNode } from "react";

// Same allowed-chars set as our username regex (`/^[a-z0-9_]{3,24}$/`).
// We require a word boundary before the @ so things like email addresses
// don't pick up false positives.
export const MENTION_PATTERN = /(^|[^A-Za-z0-9_])@([a-z0-9_]{3,24})\b/g;

// Pull a unique, lowercased list of usernames mentioned in the text.
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_PATTERN);
  while ((m = re.exec(text)) !== null) {
    out.add(m[2].toLowerCase());
  }
  return [...out];
}

// Render a body with @username as <Link>, plain text otherwise. Preserves
// surrounding whitespace exactly so the comment reads natural.
export function renderWithMentions(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = new RegExp(MENTION_PATTERN);
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const fullStart = m.index;
    // m[1] is the leading non-word char (or empty if @ is at the start).
    // m[2] is the username.
    const lead = m[1];
    const username = m[2];
    const atStart = fullStart + lead.length;

    if (atStart > last) {
      parts.push(text.slice(last, atStart));
    }
    parts.push(
      <Link
        key={`m-${key++}`}
        href={`/u/${username}`}
        className="text-emerald-400 hover:underline"
      >
        @{username}
      </Link>,
    );
    last = atStart + 1 + username.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
