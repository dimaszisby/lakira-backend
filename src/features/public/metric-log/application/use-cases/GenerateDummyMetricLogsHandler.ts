import logger from "@/utils/logger.js";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import {
  isUuid,
  readJobBody,
} from "@/shared/application/messaging/job-body.js";
import { MAX_DUMMY_METRIC_LOGS } from "./GenerateDummyMetricLogs.js";
import {
  DomainError,
  type DomainErrorKind,
} from "@/shared/domain/errors/DomainError.js";
import type { MetricAccessPort } from "../ports/MetricAccessPort.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type {
  IncomingMessage,
  MessageContext,
} from "@/shared/application/ports/MessageHandlerPort.js";
import type { CachePort } from "../ports/CachePort.js";
import type { MetricLogRepository } from "../../domain/repositories/MetricLogRepository.js";

type JobPayload = {
  jobId: string;
  userId: string;
  organizationId: string;
  metricId: string;
  count: number;
};

const TYPES: Array<"manual" | "automatic"> = ["manual", "automatic"];

/**
 * The job as GenerateDummyMetricLogs publishes it, or a terminal error. `count` drives a
 * loop that writes a row each time, so it is held to the HTTP route's own limit
 * (queue-design-hardening D-03; audit 2026-09-29, R8).
 */
const parseJob = (content: Buffer): JobPayload => {
  const body = readJobBody(content);
  const { jobId, userId, organizationId, metricId, count } = body;
  if (
    !isUuid(jobId) ||
    !isUuid(userId) ||
    !isUuid(organizationId) ||
    !isUuid(metricId)
  ) {
    throw new TerminalMessageError(
      "Refusing dummy-logs job without its ids as UUIDs.",
    );
  }
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_DUMMY_METRIC_LOGS
  ) {
    throw new TerminalMessageError(
      `Refusing dummy-logs job whose count is not a whole number from 1 to ${MAX_DUMMY_METRIC_LOGS}.`,
    );
  }
  return { jobId, userId, organizationId, metricId, count };
};

/** Access rejections that will not change on retry; any other failure may be transient. */
const TERMINAL_ACCESS_KINDS: ReadonlySet<DomainErrorKind> = new Set([
  "unauthorized",
  "forbidden",
  "not_found",
]);

export class GenerateDummyMetricLogsHandler {
  constructor(
    private access: MetricAccessPort,
    private cache: CachePort,
    private idempotency: MessageIdempotencyPort,
    private repo: MetricLogRepository,
  ) {}

  async handle(msg: IncomingMessage, { queue }: MessageContext): Promise<void> {
    const { userId, organizationId, metricId, count } = parseJob(msg.content);
    const messageId = msg.properties.messageId as unknown;

    try {
      await this.access.ensureMetricOwnership(userId, organizationId, metricId);
    } catch (error) {
      if (
        error instanceof DomainError &&
        TERMINAL_ACCESS_KINDS.has(error.kind)
      ) {
        throw new TerminalMessageError(error.message, { cause: error });
      }
      throw error;
    }

    // The dedup record and the rows share one transaction (ADR-0007).
    const outcome = await this.idempotency.runOnce(
      { messageId, queue, organizationId },
      async (tx) => {
        for (let i = 0; i < count; i++) {
          await this.repo.create(
            {
              metricId,
              organizationId,
              logValue: Number((Math.random() * 100).toFixed(2)),
              loggedAt: new Date(
                Date.now() -
                  Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000,
              ),
              type: TYPES[Math.floor(Math.random() * TYPES.length)],
            },
            tx,
          );
        }
      },
    );

    if (outcome === "duplicate") {
      logger.info("[RABBITMQ] Duplicate message skipped.", {
        messageId,
        queue,
      });
    }

    // After commit, so a reader cannot re-cache the pre-commit state. On a duplicate
    // too: if the first delivery committed and then failed here, its retry arrives as
    // a duplicate, and skipping this would leave the caches stale until their TTL.
    if (this.cache.isEnabled()) {
      await this.cache.invalidate(userId, organizationId, metricId);
    }
  }
}
