import { computeFallbackRange } from "@/features/analytics/domain/fallback-range.js";

describe("computeFallbackRange", () => {
  const requested = {
    startISO: "2024-01-01T00:00:00.000Z",
    endISO: "2024-01-31T00:00:00.000Z",
    bucket: "1d" as const,
  };

  it("returns null when no last log timestamp exists", () => {
    const result = computeFallbackRange({
      requested,
      lastLogAt: null,
      tz: "UTC",
      guardBuckets: 400,
    });
    expect(result).toBeNull();
  });

  // Kit analytics-leftovers, D-02. The window is clamped to the guard's number
  // of requested buckets, so the requested bucket always fits: the bucket used
  // to be coarsened to 1d here, and the series was queried hourly anyway.
  it("keeps the requested bucket, and the window holds at most guard + 1 of them", () => {
    const result = computeFallbackRange({
      requested: { ...requested, bucket: "1h" },
      lastLogAt: "2024-02-01T00:00:00.000Z",
      tz: "UTC",
      guardBuckets: 48,
    });

    expect(result).not.toBeNull();
    expect(result?.range.bucket).toBe("1h");
    // The end of the requested bucket, an hour, that holds the last log.
    expect(result?.range.endISO).toBe("2024-02-01T01:00:00.000Z");
    expect(result?.range.startISO).toBe("2024-01-30T01:00:00.000Z");
    expect(result?.estimatedBuckets).toBeLessThanOrEqual(49);
  });

  it("clamps the fallback window when range still exceeds guard limit", () => {
    const result = computeFallbackRange({
      requested,
      lastLogAt: "2024-08-01T00:00:00.000Z",
      tz: "UTC",
      guardBuckets: 5,
    });

    expect(result).not.toBeNull();
    // Counted at the requested bucket, a window that does not start on a bucket's
    // edge touches one more (analytics-leftovers D-02).
    expect(result?.estimatedBuckets).toBeLessThanOrEqual(6);
    expect(
      new Date(result!.range.endISO).getTime() -
        new Date(result!.range.startISO).getTime(),
    ).toBeLessThanOrEqual(5 * 24 * 60 * 60 * 1000 + 1000);
  });

  // Kit analytics-relative-range, D-03. The query is half-open and its series
  // stops a second short of the end, so a range ending at the log, or a
  // millisecond after it, leaves the log out.
  describe("ends with the bucket that holds the newest log (AC-4)", () => {
    it.each([
      ["at midday", "2024-03-10T12:00:00.000Z"],
      ["in the first second of the day", "2024-03-10T00:00:00.500Z"],
      ["on the bucket's own edge", "2024-03-10T00:00:00.000Z"],
    ])("a log %s", (_name, lastLogAt) => {
      const result = computeFallbackRange({
        requested,
        lastLogAt,
        tz: "UTC",
        guardBuckets: 400,
      });

      expect(result?.range.endISO).toBe("2024-03-11T00:00:00.000Z");
      expect(Date.parse(result!.range.startISO)).toBeLessThan(
        Date.parse(lastLogAt),
      );
    });

    it("takes the bucket's end in the requested zone", () => {
      // 20:00Z on the 10th is 03:00 on the 11th in Jakarta, whose day ends at
      // 17:00Z on the 11th.
      const result = computeFallbackRange({
        requested,
        lastLogAt: "2024-03-10T20:00:00.000Z",
        tz: "Asia/Jakarta",
        guardBuckets: 400,
      });

      expect(result?.range.endISO).toBe("2024-03-11T17:00:00.000Z");
    });
  });
});
