import type { Channel } from "amqplib";
import { APP_SHORT_NAME } from "@/config/app-name.js";
import logger from "@/utils/logger.js";

export const EXCHANGES = {
  JOBS: `${APP_SHORT_NAME}.jobs`,
  PARKING: `${APP_SHORT_NAME}.jobs.parking`,
} as const;

export const QUEUES = {
  METRIC_LOG_GENERATE_DUMMY: `${APP_SHORT_NAME}.metric-log.generate-dummy`,
  PARKING: `${APP_SHORT_NAME}.jobs.parking.queue`,
} as const;

export const ROUTING_KEYS = {
  METRIC_LOG_GENERATE_DUMMY: "metric-log.generate-dummy",
} as const;

/** Where a failed message waits out its backoff before returning to `queue` (ADR-0005). */
export const retryQueueFor = (queue: string): string => `${queue}.retry`;

export const assertTopology = async (channel: Channel): Promise<void> => {
  logger.info(`[QUEUE] Asserting topology with prefix: ${APP_SHORT_NAME}`);
  await channel.assertExchange(EXCHANGES.JOBS, "topic", { durable: true });
  await channel.assertExchange(EXCHANGES.PARKING, "topic", { durable: true });

  await channel.assertQueue(QUEUES.METRIC_LOG_GENERATE_DUMMY, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.PARKING,
    },
  });
  await channel.bindQueue(
    QUEUES.METRIC_LOG_GENERATE_DUMMY,
    EXCHANGES.JOBS,
    ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
  );

  // Retry queue — no consumer. Each message carries its own expiration (the backoff delay).
  // On expiry it dead-letters through the default exchange straight back to the queue that
  // failed it, not through the jobs exchange to every queue bound to its routing key.
  // No x-message-ttl: a queue argument cannot change without redeclaring the queue.
  await channel.assertQueue(retryQueueFor(QUEUES.METRIC_LOG_GENERATE_DUMMY), {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": QUEUES.METRIC_LOG_GENERATE_DUMMY,
    },
  });

  // Parking lot — no consumer, monitored for depth > 0
  await channel.assertQueue(QUEUES.PARKING, { durable: true });
  await channel.bindQueue(QUEUES.PARKING, EXCHANGES.PARKING, "#");
};
