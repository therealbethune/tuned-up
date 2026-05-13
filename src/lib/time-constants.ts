// Centralized time constants so the same magic number doesn't drift
// across files. Use these instead of inlining `7 * 86_400_000` etc.
//
// All values are milliseconds since the epoch math everywhere in the
// app multiplies Date.now() by these to get a window-start Date.

export const MS_PER_DAY = 86_400_000;
export const WEEK_MS = 7 * MS_PER_DAY;
export const MONTH_MS = 30 * MS_PER_DAY;
export const QUARTER_MS = 90 * MS_PER_DAY;
export const SIX_MONTHS_MS = 180 * MS_PER_DAY;
