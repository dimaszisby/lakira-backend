import { summarizeBuckets } from "@/features/analytics/domain/series-stats.js";

// Kit deterministic-query-ordering, D-05. The stats describe every bucket of
// the series, and the average is the mean of the logs, not of the buckets.
describe("summarizeBuckets", () => {
  const empty = {
    average: null,
    min: null,
    max: null,
    count: null,
  };

  it("returns nulls and a zero count for no rows", () => {
    expect(summarizeBuckets([])).toEqual({
      average: null,
      min: null,
      max: null,
      count: 0,
    });
  });

  it("returns nulls and a zero count when every bucket is empty", () => {
    expect(summarizeBuckets([empty, empty])).toEqual({
      average: null,
      min: null,
      max: null,
      count: 0,
    });
  });

  it("counts a later bucket when the first one is empty", () => {
    expect(
      summarizeBuckets([
        empty,
        { average: 50, min: 50, max: 50, count: 1 },
        empty,
      ]),
    ).toEqual({ average: 50, min: 50, max: 50, count: 1 });
  });

  it("weights each bucket's average by its count", () => {
    const stats = summarizeBuckets([
      { average: 10, min: 10, max: 10, count: 1 },
      { average: 20, min: 20, max: 20, count: 3 },
    ]);

    expect(stats.average).toBe(17.5);
    expect(stats.count).toBe(4);
  });

  it("takes the minimum and maximum across buckets", () => {
    const stats = summarizeBuckets([
      { average: 5, min: 2, max: 8, count: 2 },
      empty,
      { average: 6, min: 1, max: 11, count: 2 },
      { average: 4, min: 3, max: 5, count: 2 },
    ]);

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(11);
  });

  it("reads numeric strings, as the driver returns some numeric columns", () => {
    expect(
      summarizeBuckets([
        { average: "10", min: "10", max: "10", count: "1" },
        { average: "20.5", min: "20", max: "21", count: "2" },
      ]),
    ).toEqual({ average: 17, min: 10, max: 21, count: 3 });
  });

  it("ignores a bucket whose figures are not finite", () => {
    expect(
      summarizeBuckets([
        { average: "NaN", min: "NaN", max: "NaN", count: 1 },
        { average: 4, min: 4, max: 4, count: 1 },
      ]),
    ).toEqual({ average: 4, min: 4, max: 4, count: 1 });
  });

  it("keeps a real average of zero", () => {
    expect(
      summarizeBuckets([{ average: 0, min: 0, max: 0, count: 2 }]),
    ).toEqual({ average: 0, min: 0, max: 0, count: 2 });
  });
});
