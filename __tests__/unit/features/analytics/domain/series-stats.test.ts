import { summarizeBuckets } from "@/features/analytics/domain/series-stats.js";

// Kit deterministic-query-ordering, D-05. The stats describe every bucket of
// the series, and the average is the mean of the logs, not of the buckets.
describe("summarizeBuckets", () => {
  const empty = {
    avg_value: null,
    min_value: null,
    max_value: null,
    cnt: null,
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
        { avg_value: 50, min_value: 50, max_value: 50, cnt: 1 },
        empty,
      ]),
    ).toEqual({ average: 50, min: 50, max: 50, count: 1 });
  });

  it("weights each bucket's average by its count", () => {
    const stats = summarizeBuckets([
      { avg_value: 10, min_value: 10, max_value: 10, cnt: 1 },
      { avg_value: 20, min_value: 20, max_value: 20, cnt: 3 },
    ]);

    expect(stats.average).toBe(17.5);
    expect(stats.count).toBe(4);
  });

  it("takes the minimum and maximum across buckets", () => {
    const stats = summarizeBuckets([
      { avg_value: 5, min_value: 2, max_value: 8, cnt: 2 },
      empty,
      { avg_value: 6, min_value: 1, max_value: 11, cnt: 2 },
      { avg_value: 4, min_value: 3, max_value: 5, cnt: 2 },
    ]);

    expect(stats.min).toBe(1);
    expect(stats.max).toBe(11);
  });

  it("reads numeric strings, as the driver returns some numeric columns", () => {
    expect(
      summarizeBuckets([
        { avg_value: "10", min_value: "10", max_value: "10", cnt: "1" },
        { avg_value: "20.5", min_value: "20", max_value: "21", cnt: "2" },
      ]),
    ).toEqual({ average: 17, min: 10, max: 21, count: 3 });
  });

  it("ignores a bucket whose figures are not finite", () => {
    expect(
      summarizeBuckets([
        { avg_value: "NaN", min_value: "NaN", max_value: "NaN", cnt: 1 },
        { avg_value: 4, min_value: 4, max_value: 4, cnt: 1 },
      ]),
    ).toEqual({ average: 4, min: 4, max: 4, count: 1 });
  });

  it("keeps a real average of zero", () => {
    expect(
      summarizeBuckets([{ avg_value: 0, min_value: 0, max_value: 0, cnt: 2 }]),
    ).toEqual({ average: 0, min: 0, max: 0, count: 2 });
  });
});
