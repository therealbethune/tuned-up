// Helpers for working with user-local time given an IANA timezone string
// (e.g. "America/New_York", "UTC"). All return primitives — no Date math
// pitfalls — by going through Intl.DateTimeFormat parts.

function partsAt(date: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

// Hour 0-23 in the given timezone.
export function hourInTimezone(date: Date, timeZone: string): number {
  const p = partsAt(date, timeZone);
  return Number(p.hour);
}

// "YYYY-MM-DD" date string in the given timezone.
export function dateStringInTimezone(date: Date, timeZone: string): string {
  const p = partsAt(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

// Returns the UTC Date that corresponds to the start of the local day
// containing `date` in the given timezone. Used to query "ratings since
// the start of the user's today".
export function startOfDayUTC(date: Date, timeZone: string): Date {
  const p = partsAt(date, timeZone);
  // Build a local-clock "00:00" in that zone and resolve back to UTC by
  // computing the offset for that exact moment.
  const localMidnightAsIfUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    0,
    0,
    0,
    0,
  );
  // Now figure out what UTC instant maps to that wall-clock midnight in tz.
  // The trick: format the candidate UTC midnight in tz and see how off it is.
  const candidate = new Date(localMidnightAsIfUTC);
  const candidatePartsInTz = partsAt(candidate, timeZone);
  // Compute the difference between the candidate's appearance in tz and
  // actual midnight, then subtract that offset from the candidate to land on
  // the correct UTC instant.
  const candHour = Number(candidatePartsInTz.hour);
  const candMin = Number(candidatePartsInTz.minute);
  const offsetMs = (candHour * 60 + candMin) * 60_000;
  return new Date(candidate.getTime() - offsetMs);
}
