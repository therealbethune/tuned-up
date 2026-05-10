// Tiny helper so a single broken query (e.g. a column that hasn't migrated
// yet on a fresh deploy) can't 500 the whole page. Logs to the server console
// so we still notice. Use sparingly — only for non-critical features that
// should gracefully degrade if their schema isn't there yet.
//
//   const link = await safeQuery(
//     () => db.select().from(spotifyAccounts).where(...),
//     [],
//     "spotify-link",
//   );
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (typeof console !== "undefined") {
      console.warn(`[safe-query${label ? `:${label}` : ""}] swallowed:`, (e as Error).message);
    }
    return fallback;
  }
}
