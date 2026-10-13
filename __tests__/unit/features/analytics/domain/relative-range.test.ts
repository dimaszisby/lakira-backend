import {
  parseRelativeWindow,
  resolveRelativeRange,
  startOfNextBucket,
} from "@/features/analytics/domain/relative-range.js";

// Kit analytics-relative-range, ADR-0062. Every expectation is an instant worked
// out by hand from the zone's offset on that date, so a wrong offset fails here.
describe("resolveRelativeRange", () => {
  const range = (
    now: string,
    tz: string,
    last = "7d",
    bucket: "1h" | "1d" | "1w" | "1m" | "1y" = "1d",
  ) => resolveRelativeRange({ last, bucket, tz, now: new Date(now) });

  describe("includes the current day (AC-1)", () => {
    it.each([
      [
        "UTC, a minute before 00:00 UTC",
        "2026-10-13T23:59:00.000Z",
        "UTC",
        "2026-10-07T00:00:00.000Z",
        "2026-10-14T00:00:00.000Z",
      ],
      [
        "UTC, a minute after 00:00 UTC",
        "2026-10-14T00:01:00.000Z",
        "UTC",
        "2026-10-08T00:00:00.000Z",
        "2026-10-15T00:00:00.000Z",
      ],
      [
        "Jakarta, a minute before 00:00 UTC",
        "2026-10-13T23:59:00.000Z",
        "Asia/Jakarta",
        "2026-10-07T17:00:00.000Z",
        "2026-10-14T17:00:00.000Z",
      ],
      [
        "Jakarta, a minute after 00:00 UTC: the same local day",
        "2026-10-14T00:01:00.000Z",
        "Asia/Jakarta",
        "2026-10-07T17:00:00.000Z",
        "2026-10-14T17:00:00.000Z",
      ],
      [
        "Jakarta, a minute before its own midnight",
        "2026-10-13T16:59:00.000Z",
        "Asia/Jakarta",
        "2026-10-06T17:00:00.000Z",
        "2026-10-13T17:00:00.000Z",
      ],
    ])("%s", (_name, now, tz, startISO, endISO) => {
      const result = range(now, tz);
      expect(result).toEqual({ startISO, endISO });
      expect(Date.parse(result.endISO)).toBeGreaterThan(Date.parse(now));
    });
  });

  it("gives one range to every instant inside a bucket (AC-2)", () => {
    const early = range("2026-10-13T17:00:00.000Z", "Asia/Jakarta");
    const late = range("2026-10-14T16:59:59.999Z", "Asia/Jakarta");
    expect(late).toEqual(early);
    expect(range("2026-10-14T17:00:00.000Z", "Asia/Jakarta")).not.toEqual(
      early,
    );
  });

  describe("follows the zone through an offset change (AC-7)", () => {
    it("starts and ends on local midnights when New York leaves daylight saving time", () => {
      // 2025-11-02: midnight is 04:00Z before the change and 05:00Z after it.
      expect(range("2025-11-03T15:00:00.000Z", "America/New_York")).toEqual({
        startISO: "2025-10-28T04:00:00.000Z",
        endISO: "2025-11-04T05:00:00.000Z",
      });
    });

    it("starts and ends on local midnights when New York enters daylight saving time", () => {
      // 2026-03-08: midnight is 05:00Z before the change and 04:00Z after it.
      expect(range("2026-03-10T15:00:00.000Z", "America/New_York")).toEqual({
        startISO: "2026-03-04T05:00:00.000Z",
        endISO: "2026-03-11T04:00:00.000Z",
      });
    });

    it("ends an hourly range on a local hour in a half-hour zone", () => {
      // Kolkata is UTC+05:30: 10:10Z is 15:40 local, and 16:00 local is 10:30Z.
      expect(
        range("2026-10-13T10:10:00.000Z", "Asia/Kolkata", "24h", "1h"),
      ).toEqual({
        startISO: "2026-10-12T10:30:00.000Z",
        endISO: "2026-10-13T10:30:00.000Z",
      });
    });
  });

  describe("every bucket size", () => {
    // 2026-10-14 is a Wednesday.
    const now = "2026-10-14T10:20:30.000Z";

    it.each([
      ["1h", "6h", "2026-10-14T05:00:00.000Z", "2026-10-14T11:00:00.000Z"],
      ["1d", "30d", "2026-09-15T00:00:00.000Z", "2026-10-15T00:00:00.000Z"],
      ["1w", "4w", "2026-09-21T00:00:00.000Z", "2026-10-19T00:00:00.000Z"],
      ["1m", "3m", "2026-08-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"],
      ["1y", "2y", "2025-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
    ] as const)("bucket %s with last=%s", (bucket, last, startISO, endISO) => {
      expect(range(now, "UTC", last, bucket)).toEqual({ startISO, endISO });
    });

    it("ends a weekly range a week on when now is the Monday the week starts", () => {
      expect(range("2026-10-19T00:00:00.000Z", "UTC", "1w", "1w")).toEqual({
        startISO: "2026-10-19T00:00:00.000Z",
        endISO: "2026-10-26T00:00:00.000Z",
      });
    });
  });

  describe("a month or a year back from a day the target month lacks", () => {
    it("lands on the last day of February, not in March", () => {
      expect(range("2026-03-30T12:00:00.000Z", "UTC", "1m")).toEqual({
        startISO: "2026-02-28T00:00:00.000Z",
        endISO: "2026-03-31T00:00:00.000Z",
      });
    });

    it("lands on 28 February a year before a 29 February", () => {
      expect(range("2024-02-28T12:00:00.000Z", "UTC", "1y")).toEqual({
        startISO: "2023-02-28T00:00:00.000Z",
        endISO: "2024-02-29T00:00:00.000Z",
      });
    });
  });

  it("returns an empty range for a window longer than a date can hold", () => {
    const result = range("2026-10-14T10:20:30.000Z", "UTC", "300000y", "1y");
    expect(result.startISO).toBe(result.endISO);
  });

  it("returns an empty range for a window it cannot parse", () => {
    const result = range("2026-10-14T10:20:30.000Z", "UTC", "soon");
    expect(result.startISO).toBe(result.endISO);
  });
});

describe("startOfNextBucket", () => {
  it("takes the instant the clocks moved when the zone skips midnight", () => {
    // Sao Paulo, 2018-11-04: 00:00 did not happen; the day began at 01:00, 03:00Z.
    expect(
      startOfNextBucket(
        new Date("2018-11-03T15:00:00.000Z"),
        "1d",
        "America/Sao_Paulo",
      ).toISOString(),
    ).toBe("2018-11-04T03:00:00.000Z");
  });

  it("takes the first midnight when the zone has two", () => {
    // Havana, 2025-11-02: 01:00 went back to 00:00, so 00:00 happened at 04:00Z
    // and again at 05:00Z.
    expect(
      startOfNextBucket(
        new Date("2025-11-01T15:00:00.000Z"),
        "1d",
        "America/Havana",
      ).toISOString(),
    ).toBe("2025-11-02T04:00:00.000Z");
  });

  // Berlin is east of UTC, where the first guess at the offset errs the other
  // way: 02:00 on 2025-10-26 happened at 00:00Z and again at 01:00Z.
  it("takes the first of two local hours east of UTC", () => {
    expect(
      startOfNextBucket(
        new Date("2025-10-25T23:30:00.000Z"),
        "1h",
        "Europe/Berlin",
      ).toISOString(),
    ).toBe("2025-10-26T00:00:00.000Z");
  });

  it("takes the instant the clocks moved when the zone skips an hour", () => {
    // Berlin, 2026-03-29: 02:00 did not happen; 01:59 was followed by 03:00, 01:00Z.
    expect(
      startOfNextBucket(
        new Date("2026-03-29T00:30:00.000Z"),
        "1h",
        "Europe/Berlin",
      ).toISOString(),
    ).toBe("2026-03-29T01:00:00.000Z");
  });

  it("moves an instant on a bucket edge to the next edge", () => {
    expect(
      startOfNextBucket(
        new Date("2026-10-14T00:00:00.000Z"),
        "1d",
        "UTC",
      ).toISOString(),
    ).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("parseRelativeWindow", () => {
  it.each([
    ["7d", { amount: 7, unit: "d" }],
    ["12m", { amount: 12, unit: "m" }],
  ])("reads %s", (value, expected) => {
    expect(parseRelativeWindow(value)).toEqual(expected);
  });

  it.each(["0d", "d", "7", "7x", "-7d"])("refuses %s", (value) => {
    expect(parseRelativeWindow(value)).toBeNull();
  });
});
