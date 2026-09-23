import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import type { Response, NextFunction } from "express";
import { createErrorHandler } from "@/shared/middleware/error.js";
import { Metric } from "@/features/metric/domain/entities/Metric.js";
import { buildMetricSettings } from "../../factories/metric-settings.js";
import { InvalidTokenError } from "@/features/auth/domain/errors/InvalidTokenError.js";

/**
 * Characterisation test for the error envelope produced by domain-layer throws.
 *
 * Written BEFORE the DomainError refactor and asserting the envelope as it is
 * today, so the refactor can be shown not to change it (feature-boundaries AC-6).
 * The envelope is what every client parses, and C3 already rewrote it once.
 *
 * It drives the real entity methods rather than constructing errors by hand — if a
 * throw is missed during the refactor, the status silently becomes 500 here rather
 * than staying 400, because the handler falls through to its own default.
 */

jest.mock("@/config/envManager.js", () => ({
  env: { NODE_ENV: "development" },
}));

jest.mock("@/utils/logger.js", () => ({
  error: jest.fn(),
}));

const createResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as Response;
};

const handler = createErrorHandler();

/** Runs whatever `fn` throws through the error middleware and reports the envelope. */
const envelopeFor = (fn: () => unknown) => {
  let thrown: Error | undefined;
  try {
    fn();
  } catch (error) {
    thrown = error as Error;
  }
  if (!thrown) throw new Error("expected the domain to throw, but it did not");

  const res = createResponse();
  handler(thrown, {} as AuthRequest, res, jest.fn() as NextFunction);

  const status = (res.status as unknown as jest.Mock).mock
    .calls[0][0] as number;
  const body = (res.json as unknown as jest.Mock).mock.calls[0][0] as {
    status: string;
    message: string;
  };
  return { status, body };
};

const baseMetricProps = {
  id: "metric-1",
  userId: "user-1",
  name: "Steps",
  defaultUnit: "steps",
  isPublic: true,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
  updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  categoryId: null,
  originalMetricId: null,
  description: null,
  deletedAt: null,
};

const metric = () => Metric.fromProps({ ...baseMetricProps });
const LONG = "x".repeat(5000);
// "Invalid" means control characters or unpaired surrogates — not punctuation.
const UNPAIRED_SURROGATE = "bad\uD800value";

describe("domain throws produce a stable error envelope", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Metric entity", () => {
    it.each([
      ["rename: empty", () => metric().rename("   ")],
      ["rename: too long", () => metric().rename(LONG)],
      ["rename: invalid characters", () => metric().rename(UNPAIRED_SURROGATE)],
      ["describe: too long", () => metric().describe(LONG)],
      [
        "describe: invalid characters",
        () => metric().describe(UNPAIRED_SURROGATE),
      ],
      ["setDefaultUnit: empty", () => metric().setDefaultUnit("   ")],
      ["setDefaultUnit: too long", () => metric().setDefaultUnit(LONG)],
      [
        "setDefaultUnit: invalid characters",
        () => metric().setDefaultUnit(UNPAIRED_SURROGATE),
      ],
    ])("%s → 400 with the domain message", (_label, fn) => {
      const { status, body } = envelopeFor(fn);

      expect(status).toBe(400);
      expect(body).toMatchObject({ status: "fail" });
      expect(body.message).toEqual(expect.any(String));
      expect(body.message).not.toBe("Something went wrong!");
    });
  });

  describe("MetricSettings entity", () => {
    it.each([
      [
        "goalEnabled without goalType/goalValue",
        () =>
          buildMetricSettings().updateDetails({
            goalEnabled: true,
            goalType: null,
            goalValue: null,
          }),
      ],
      [
        "timeFrameEnabled without dates",
        () =>
          buildMetricSettings().updateDetails({
            timeFrameEnabled: true,
            startDate: null,
            deadlineDate: null,
          }),
      ],
      [
        "deadlineDate not after startDate",
        () =>
          buildMetricSettings().updateDetails({
            timeFrameEnabled: true,
            startDate: new Date("2024-02-01T00:00:00.000Z"),
            deadlineDate: new Date("2024-01-01T00:00:00.000Z"),
          }),
      ],
      [
        "alertEnabled without thresholds",
        () =>
          buildMetricSettings().updateDetails({
            alertEnabled: true,
            alertThresholds: null,
          }),
      ],
    ])("%s → 400 with the domain message", (_label, fn) => {
      const { status, body } = envelopeFor(fn);

      expect(status).toBe(400);
      expect(body).toMatchObject({ status: "fail" });
      expect(body.message).not.toBe("Something went wrong!");
    });
  });

  // The existing "domain error" precedent, which extends AppError today. Its status
  // must survive the refactor unchanged, or every unauthenticated request changes shape.
  it("InvalidTokenError → 401", () => {
    const { status, body } = envelopeFor(() => {
      throw new InvalidTokenError();
    });

    expect(status).toBe(401);
    expect(body).toMatchObject({ status: "fail" });
    expect(body.message).toBe("Unauthorized: Invalid token");
  });
});
