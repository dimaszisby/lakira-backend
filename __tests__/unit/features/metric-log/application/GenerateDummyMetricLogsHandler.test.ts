import { describe, it, expect, jest } from "@jest/globals";
import { GenerateDummyMetricLogsHandler } from "@/features/metric-log/application/use-cases/GenerateDummyMetricLogsHandler.js";
import type { MetricAccessPort } from "@/features/metric-log/application/ports/MetricAccessPort.js";
import type { CachePort } from "@/features/metric-log/application/ports/CachePort.js";
import type { MetricLogRepository } from "@/features/metric-log/domain/repositories/MetricLogRepository.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import { isTerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";

const job = Buffer.from(
  JSON.stringify({
    jobId: "job-1",
    userId: "user-1",
    organizationId: "org-1",
    metricId: "metric-1",
    count: 1,
  }),
);

const build = (accessFailure: Error) => {
  const access = {
    ensureMetricOwnership: jest.fn(async () => {
      throw accessFailure;
    }),
  } as unknown as MetricAccessPort;
  const idempotency = {
    runOnce: jest.fn(),
  } as unknown as jest.Mocked<MessageIdempotencyPort>;
  const sut = new GenerateDummyMetricLogsHandler(
    access,
    { isEnabled: () => false } as unknown as CachePort,
    idempotency,
    {} as MetricLogRepository,
  );
  return { sut, idempotency };
};

const outcome = async (accessFailure: Error) => {
  const { sut, idempotency } = build(accessFailure);
  const error = await sut
    .handle(
      { content: job, properties: { messageId: "msg-1" } },
      { queue: "q" },
    )
    .then(
      () => null,
      (e: unknown) => e,
    );
  expect(idempotency.runOnce).not.toHaveBeenCalled();
  return error;
};

// application-errors D-03: an ownership rejection that no retry can change parks
// at once, decided by kind; it used to be decided by HTTP status (audit R7).
describe("GenerateDummyMetricLogsHandler, when the ownership check fails", () => {
  it.each([
    ["unauthorized", new UnauthorizedError("User not authenticated")],
    ["not_found", new NotFoundError("Metric not found")],
    ["forbidden", new ForbiddenError("Unauthorized access to metric")],
  ])("parks a %s rejection, keeping its message", async (_kind, failure) => {
    const error = await outcome(failure);

    expect(isTerminalMessageError(error)).toBe(true);
    expect((error as Error).message).toBe(failure.message);
  });

  it.each([
    ["an unexpected error", new Error("connection reset")],
    ["a validation error", new ValidationError("bad input")],
    ["a conflict", new ConflictError("clash")],
  ])("retries %s", async (_label, failure) => {
    const error = await outcome(failure);

    expect(isTerminalMessageError(error)).toBe(false);
    expect(error).toBe(failure);
  });
});
