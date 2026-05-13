import { reportError } from "@/lib/report-error";

// Tiny helper so a single broken query (e.g. a column that hasn't migrated
// yet on a fresh deploy, or a transient Neon outage) can't 500 the whole
// page. Use generously — pages should keep rendering even when downstream
// queries fail.
//
// Why we ALSO call reportError: the previous version only console.warned
// and silently swallowed the rest. Sentry never saw any of it. So we'd
// have whole-app degradations (the entire DB returning 402, or a column
// missing post-migration) and zero alert signal. reportError prefixes
// the Sentry tag with the label so we can search for `safe-query:feed-items`
// in the dashboard.
//
//   const rows = await safeQuery(
//     () => db.select().from(users).where(...),
//     [],
//     "user-lookup",
//   );
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    reportError(e, `safe-query${label ? `:${label}` : ""}`);
    return fallback;
  }
}
