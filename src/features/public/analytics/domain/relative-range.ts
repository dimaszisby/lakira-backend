import type { BucketAlias } from "./buckets.js";

// Where a relative range (`last=7d`) starts and ends: ADR-0062.
//
// A "wall time" below is a local date and time in the requested zone, held as the
// epoch milliseconds the same fields would have in UTC. That lets the calendar
// arithmetic use the Date UTC accessors, whatever zone the process runs in.

export const LAST_WINDOW_REGEX = /^[1-9][0-9]*(h|d|w|m|y)$/;
export type RelativeUnit = "h" | "d" | "w" | "m" | "y";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// The largest time a Date holds, less room for the offset arithmetic.
const MAX_WALL_MS = 8_640_000_000_000_000 - 2 * DAY_MS;

export function parseRelativeWindow(value: string) {
  if (!LAST_WINDOW_REGEX.test(value)) return null;
  const amount = Number(value.slice(0, -1));
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const unit = value.slice(-1) as RelativeUnit;
  return { amount, unit };
}

type Zone = {
  wallTimeOf(instantMs: number): number;
  instantOf(wallMs: number): number;
};

function zoneFor(tz: string): Zone {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    calendar: "iso8601",
    numberingSystem: "latn",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const wallTimeOf = (instantMs: number) => {
    const fields: Record<string, number> = {};
    for (const part of format.formatToParts(instantMs)) {
      if (part.type !== "literal") fields[part.type] = Number(part.value);
    }
    const wholeSeconds = Date.UTC(
      fields.year,
      fields.month - 1,
      fields.day,
      fields.hour,
      fields.minute,
      fields.second,
    );
    return wholeSeconds + (((instantMs % 1000) + 1000) % 1000);
  };

  const offsetAt = (instantMs: number) => wallTimeOf(instantMs) - instantMs;

  const instantOf = (wallMs: number) => {
    // The offset is not known until the instant is, so try the offsets in force a
    // day either side, which are the two an offset change near this wall time
    // moves between. A wall time that happens twice (clocks set back) matches
    // both and takes the earlier. One that never happens (clocks set forward)
    // matches neither and takes the instant the clocks moved.
    const candidates = [
      wallMs - offsetAt(wallMs - DAY_MS),
      wallMs - offsetAt(wallMs + DAY_MS),
    ];
    const matches = candidates.filter((c) => wallTimeOf(c) === wallMs);
    if (matches.length > 0) return Math.min(...matches);

    let before = Math.min(...candidates);
    let after = Math.max(...candidates);
    const offsetAfter = offsetAt(after);
    while (after - before > 1) {
      const middle = before + Math.floor((after - before) / 2);
      if (offsetAt(middle) === offsetAfter) after = middle;
      else before = middle;
    }
    return after;
  };

  return { wallTimeOf, instantOf };
}

// Weeks start on Monday, as Postgres's date_trunc('week') does.
function startOfNextBucketWall(wallMs: number, bucket: BucketAlias): number {
  const wall = new Date(wallMs);
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  const startOfDay = Date.UTC(year, month, wall.getUTCDate());

  switch (bucket) {
    case "1h":
      return Math.floor(wallMs / HOUR_MS) * HOUR_MS + HOUR_MS;
    case "1d":
      return startOfDay + DAY_MS;
    case "1w": {
      const daysSinceMonday = (wall.getUTCDay() + 6) % 7;
      return startOfDay + (7 - daysSinceMonday) * DAY_MS;
    }
    case "1m":
      return Date.UTC(year, month + 1, 1);
    case "1y":
      return Date.UTC(year + 1, 0, 1);
  }
}

// A month or a year back from the 31st lands on the last day of a shorter month,
// not in the month after it.
function subtractMonthsWall(wallMs: number, months: number): number {
  const wall = new Date(wallMs);
  const firstOfTarget = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() - months, 1),
  );
  const daysInTarget = new Date(
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  const timeOfDay =
    wallMs -
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  return (
    Date.UTC(
      firstOfTarget.getUTCFullYear(),
      firstOfTarget.getUTCMonth(),
      Math.min(wall.getUTCDate(), daysInTarget),
    ) + timeOfDay
  );
}

function subtractWindowWall(
  wallMs: number,
  amount: number,
  unit: RelativeUnit,
): number {
  switch (unit) {
    case "h":
      return wallMs - amount * HOUR_MS;
    case "d":
      return wallMs - amount * DAY_MS;
    case "w":
      return wallMs - amount * 7 * DAY_MS;
    case "m":
      return subtractMonthsWall(wallMs, amount);
    case "y":
      return subtractMonthsWall(wallMs, amount * 12);
  }
}

/** The first instant of the bucket after the one `instant` is in, in zone `tz`. */
export function startOfNextBucket(
  instant: Date,
  bucket: BucketAlias,
  tz: string,
): Date {
  const zone = zoneFor(tz);
  const wall = zone.wallTimeOf(instant.getTime());
  return new Date(zone.instantOf(startOfNextBucketWall(wall, bucket)));
}

export type RelativeRangeInput = {
  last: string;
  bucket: BucketAlias;
  tz: string;
  now: Date;
};

/**
 * The range a relative window covers: it ends with the bucket `now` is in, so the
 * current bucket is included, and it starts the window's length before that in the
 * zone's own calendar. Every instant inside one bucket gives the same range, which
 * is what keeps the cache key and the ETag stable.
 */
export function resolveRelativeRange({
  last,
  bucket,
  tz,
  now,
}: RelativeRangeInput): { startISO: string; endISO: string } {
  const zone = zoneFor(tz);
  const endWall = startOfNextBucketWall(zone.wallTimeOf(now.getTime()), bucket);
  const end = new Date(zone.instantOf(endWall));
  const endISO = end.toISOString();

  const parsed = parseRelativeWindow(last);
  if (!parsed) return { startISO: endISO, endISO };

  const startWall = subtractWindowWall(endWall, parsed.amount, parsed.unit);
  // A window that reaches past what a Date can hold gives an empty range, which
  // is refused downstream as an invalid one.
  if (!(Math.abs(startWall) <= MAX_WALL_MS))
    return { startISO: endISO, endISO };
  const start = new Date(zone.instantOf(startWall));
  return { startISO: start.toISOString(), endISO };
}
