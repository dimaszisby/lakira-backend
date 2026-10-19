import type { Channel } from "amqplib";
import { APP_SHORT_NAME } from "@/config/app-name.js";
import logger from "@/utils/logger.js";

import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";

// The names a publisher uses are declared beside the queue port; this module owns
// what is declared on the broker.
export { EXCHANGES, ROUTING_KEYS };

export const QUEUES = {
  METRIC_LOG_GENERATE_DUMMY: `${APP_SHORT_NAME}.metric-log.generate-dummy`,
  AUTH_SEND_VERIFICATION_EMAIL: `${APP_SHORT_NAME}.auth.send-verification-email`,
  AUTH_SEND_PASSWORD_RESET_EMAIL: `${APP_SHORT_NAME}.auth.send-password-reset-email`,
  PARKING: `${APP_SHORT_NAME}.jobs.parking.queue`,
} as const;

/** Where a failed message waits out its backoff before returning to `queue` (ADR-0005). */
export const retryQueueFor = (queue: string): string => `${queue}.retry`;

/**
 * A queue a consumer reads, bound to the jobs exchange, with its retry queue. Every
 * work queue is declared here, so no two can differ in how they retry or park.
 */
export const assertWorkQueue = async (
  channel: Channel,
  queue: string,
  routingKey: string,
): Promise<void> => {
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": EXCHANGES.PARKING,
    },
  });
  await channel.bindQueue(queue, EXCHANGES.JOBS, routingKey);

  // Retry queue — no consumer. Each message carries its own expiration (the backoff delay).
  // On expiry it dead-letters through the default exchange straight back to the queue that
  // failed it, not through the jobs exchange to every queue bound to its routing key.
  // No x-message-ttl: a queue argument cannot change without redeclaring the queue.
  await channel.assertQueue(retryQueueFor(queue), {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queue,
    },
  });
};

export const assertTopology = async (channel: Channel): Promise<void> => {
  logger.info(`[QUEUE] Asserting topology with prefix: ${APP_SHORT_NAME}`);
  await channel.assertExchange(EXCHANGES.JOBS, "topic", { durable: true });
  await channel.assertExchange(EXCHANGES.PARKING, "topic", { durable: true });

  await assertWorkQueue(
    channel,
    QUEUES.METRIC_LOG_GENERATE_DUMMY,
    ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
  );
  await assertWorkQueue(
    channel,
    QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
    ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL,
  );
  await assertWorkQueue(
    channel,
    QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
    ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL,
  );

  // Parking lot — no consumer, monitored for depth > 0
  await channel.assertQueue(QUEUES.PARKING, { durable: true });
  await channel.bindQueue(QUEUES.PARKING, EXCHANGES.PARKING, "#");
};
