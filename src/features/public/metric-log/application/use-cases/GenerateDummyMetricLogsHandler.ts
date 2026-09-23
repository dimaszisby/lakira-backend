import type { ConsumeMessage } from "amqplib";
import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";
import { TerminalMessageError } from "@/shared/application/errors/TerminalMessageError.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { MessageContext } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
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

/** Access rejections that will not change on retry; any other failure may be transient. */
const TERMINAL_ACCESS_STATUSES = new Set([401, 403, 404]);

export class GenerateDummyMetricLogsHandler {
  constructor(
    private access: MetricAccessPort,
    private cache: CachePort,
    private idempotency: MessageIdempotencyPort,
    private repo: MetricLogRepository,
  ) {}

  async handle(msg: ConsumeMessage, { queue }: MessageContext): Promise<void> {
    let payload: JobPayload;
    try {
      payload = JSON.parse(msg.content.toString()) as JobPayload;
    } catch (error) {
      throw new TerminalMessageError("Refusing message with malformed JSON.", {
        cause: error,
      });
    }
    const { userId, organizationId, metricId, count } = payload;
    const messageId = msg.properties.messageId as unknown;

    try {
      await this.access.ensureMetricOwnership(userId, organizationId, metricId);
    } catch (error) {
      if (
        error instanceof AppError &&
        TERMINAL_ACCESS_STATUSES.has(error.statusCode)
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
      return;
    }

    // After commit, so a reader cannot re-cache the pre-commit state.
    if (this.cache.isEnabled()) {
      await this.cache.invalidate(userId, organizationId, metricId);
    }
  }
}
