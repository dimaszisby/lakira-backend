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

// UUIDs, as GenerateDummyMetricLogs publishes them: the handler refuses anything else
// (queue-design-hardening D-03).
const VALID_JOB = {
  jobId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000003",
  metricId: "00000000-0000-4000-8000-000000000004",
  count: 1,
};
const job = Buffer.from(JSON.stringify(VALID_JOB));

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

// queue-design-hardening D-03 (audit 2026-09-29, R8): the payload was cast, not
// checked, and `count` drives a loop that writes a row each time. A payload no retry
// can fix parks before the ownership check or any write.
describe("GenerateDummyMetricLogsHandler, when the payload is not a job", () => {
  const handleRaw = async (content: Buffer) => {
    const access = { ensureMetricOwnership: jest.fn() };
    const idempotency = { runOnce: jest.fn() };
    const sut = new GenerateDummyMetricLogsHandler(
      access as unknown as MetricAccessPort,
      { isEnabled: () => false } as unknown as CachePort,
      idempotency as unknown as MessageIdempotencyPort,
      {} as MetricLogRepository,
    );
    const error = await sut
      .handle({ content, properties: { messageId: "msg-1" } }, { queue: "q" })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(access.ensureMetricOwnership).not.toHaveBeenCalled();
    expect(idempotency.runOnce).not.toHaveBeenCalled();
    return error;
  };
  const withField = (field: string, value: unknown) =>
    Buffer.from(JSON.stringify({ ...VALID_JOB, [field]: value }));

  it.each([
    ["malformed JSON", Buffer.from("{not json")],
    ["JSON that is not an object", Buffer.from("42")],
    ["a jobId that is not a UUID", withField("jobId", "job-1")],
    ["a userId that is not a UUID", withField("userId", "user-1")],
    [
      "an organizationId that is missing",
      withField("organizationId", undefined),
    ],
    ["a metricId that is a number", withField("metricId", 7)],
    ["a count that is a string", withField("count", "5")],
    ["a count that is not whole", withField("count", 1.5)],
    ["a count of zero", withField("count", 0)],
    ["a count above the HTTP route's limit", withField("count", 1001)],
  ])("parks %s", async (_case, content) => {
    expect(isTerminalMessageError(await handleRaw(content))).toBe(true);
  });
});
