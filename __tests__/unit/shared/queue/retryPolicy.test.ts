import { describe, it, expect } from "@jest/globals";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import { InvalidMessageIdError } from "@/shared/infrastructure/queue/SequelizeMessageIdempotency.js";
import {
  MAX_RETRY_DELAY_MS,
  decideOnFailure,
  readRetryCount,
} from "@/shared/infrastructure/queue/retryPolicy.js";

const decide = (error: unknown, retryCount: number, maxRetries = 5) =>
  decideOnFailure({ error, retryCount, maxRetries, baseDelayMs: 2000 });

describe("decideOnFailure", () => {
  it("retries an unrecognised error — the safe default", () => {
    expect(decide(new Error("connection reset"), 0)).toEqual({
      action: "retry",
      nextRetryCount: 1,
      delayMs: 2000,
    });
    expect(decide("not even an Error", 0).action).toBe("retry");
  });

  it("parks a terminal error on the first failure", () => {
    expect(decide(new TerminalMessageError("malformed"), 0)).toEqual({
      action: "park",
      reason: "terminal",
    });
    expect(decide(new InvalidMessageIdError(undefined), 0)).toEqual({
      action: "park",
      reason: "terminal",
    });
  });

  it("parks once the retry budget is spent", () => {
    expect(decide(new Error("x"), 4).action).toBe("retry");
    expect(decide(new Error("x"), 5)).toEqual({
      action: "park",
      reason: "exhausted",
    });
  });

  it("parks on the first failure when maxRetries is 0", () => {
    expect(decide(new Error("x"), 0, 0)).toEqual({
      action: "park",
      reason: "exhausted",
    });
  });

  it("doubles the delay per retry and caps it", () => {
    const delays = [0, 1, 2, 3, 4].map(
      (n) => (decide(new Error("x"), n) as { delayMs: number }).delayMs,
    );
    expect(delays).toEqual([2000, 4000, 8000, 16000, 32000]);
    expect(
      (decide(new Error("x"), 20, 50) as { delayMs: number }).delayMs,
    ).toBe(MAX_RETRY_DELAY_MS);
  });
});

describe("readRetryCount", () => {
  it("reads the header as a number or a string", () => {
    expect(readRetryCount({ "x-retry-count": 3 })).toBe(3);
    expect(readRetryCount({ "x-retry-count": "2" })).toBe(2);
  });

  it("treats an absent or unreadable header as a first attempt", () => {
    expect(readRetryCount(undefined)).toBe(0);
    expect(readRetryCount({})).toBe(0);
    expect(readRetryCount({ "x-retry-count": "abc" })).toBe(0);
    expect(readRetryCount({ "x-retry-count": -1 })).toBe(0);
  });
});
