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
  // 1. Get the local Y-M-D for the input moment.
  const p = partsAt(date, timeZone);
  const yy = Number(p.year);
  const mm = Number(p.month);
  const dd = Number(p.day);

  // 2. Treat that local midnight as if it were a UTC instant. This is
  //    "wrong" by exactly the tz offset; we compute the offset next.
  const targetAsIfUtc = Date.UTC(yy, mm - 1, dd);

  // 3. Read what `targetAsIfUtc` ACTUALLY looks like when interpreted in
  //    `timeZone`. Then convert that wall clock back to a UTC-ms (as if
  //    it were UTC). The difference is the tz offset at that moment.
  //    Older versions subtracted hours×3600s of the candidate which
  //    silently dropped 24h whenever the candidate's tz date had
  //    crossed back to the previous day — i.e. for every tz west of UTC.
  const cand = new Date(targetAsIfUtc);
  const cp = partsAt(cand, timeZone);
  const seenAsIfUtc = Date.UTC(
    Number(cp.year),
    Number(cp.month) - 1,
    Number(cp.day),
    Number(cp.hour),
    Number(cp.minute),
  );
  const offsetMs = seenAsIfUtc - targetAsIfUtc;
  return new Date(targetAsIfUtc - offsetMs);
}
