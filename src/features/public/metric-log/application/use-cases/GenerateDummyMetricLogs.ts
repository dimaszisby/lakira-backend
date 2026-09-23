import { randomUUID } from "crypto";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { MetricLogRepository } from "../../domain/repositories/MetricLogRepository.js";
import { CachePort } from "../ports/CachePort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/infrastructure/queue/topology.js";

type Input = {
  userId: string;
  organizationId: string;
  metricId: string;
  count: number;
};

type Output = {
  jobId: string;
};

const TYPES: Array<"manual" | "automatic"> = ["manual", "automatic"];

export class GenerateDummyMetricLogs {
  constructor(
    private access: MetricAccessPort,
    private cache: CachePort,
    private queue: MessageQueuePort,
    private repo: MetricLogRepository,
  ) {}

  async execute({
    userId,
    organizationId,
    metricId,
    count,
  }: Input): Promise<Output> {
    await this.access.ensureMetricOwnership(userId, organizationId, metricId);

    const jobId = randomUUID();

    if (this.queue.isEnabled()) {
      await this.queue.publish(
        EXCHANGES.JOBS,
        { jobId, userId, organizationId, metricId, count },
        {
          routingKey: ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
          messageId: jobId,
        },
      );
      return { jobId };
    }

    // Sync fallback when queue is disabled (development / tests)
    for (let i = 0; i < count; i++) {
      await this.repo.create({
        metricId,
        organizationId,
        logValue: Number((Math.random() * 100).toFixed(2)),
        loggedAt: new Date(
          Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000,
        ),
        type: TYPES[Math.floor(Math.random() * TYPES.length)],
      });
    }

    if (this.cache.isEnabled()) {
      await this.cache.invalidate(userId, organizationId, metricId);
    }

    return { jobId };
  }
}
