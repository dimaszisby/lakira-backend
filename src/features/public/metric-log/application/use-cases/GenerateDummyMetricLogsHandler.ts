import type { ConsumeMessage } from "amqplib";
import { models } from "@/infrastructure/db/models.js";
import logger from "@/utils/logger.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { MessageContext } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import type { CachePort } from "../ports/CachePort.js";

type JobPayload = {
  jobId: string;
  userId: string;
  organizationId: string;
  metricId: string;
  count: number;
};

const TYPES: Array<"manual" | "automatic"> = ["manual", "automatic"];

/** The ORM transaction type, without importing the ORM into the application layer. */
type DbTransaction = NonNullable<
  Parameters<typeof models.MetricLog.create>[1]
>["transaction"];

export class GenerateDummyMetricLogsHandler {
  constructor(
    private access: MetricAccessPort,
    private cache: CachePort,
    private idempotency: MessageIdempotencyPort,
  ) {}

  async handle(msg: ConsumeMessage, { queue }: MessageContext): Promise<void> {
    const payload = JSON.parse(msg.content.toString()) as JobPayload;
    const { userId, organizationId, metricId, count } = payload;
    const messageId = msg.properties.messageId as unknown;

    await this.access.ensureMetricOwnership(userId, organizationId, metricId);

    // The dedup record and the rows share one transaction (ADR-0007).
    const outcome = await this.idempotency.runOnce(
      { messageId, queue, organizationId },
      async (tx) => {
        const transaction = tx as DbTransaction;
        for (let i = 0; i < count; i++) {
          await models.MetricLog.create(
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
            { transaction },
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
