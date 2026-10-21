import type { Channel } from "amqplib";
import { APP_SHORT_NAME } from "@/config/app-name.js";
import logger from "@/utils/logger.js";

import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";

// The names a publisher uses are declared beside the queue port; this module owns
// what is declared on the broker.
export { EXCHANGES, QUEUES, ROUTING_KEYS };

/**
 * Where a failed message waits out a backoff of `delayMs` before returning to `queue`
 * (ADR-0005, ADR-0073). One queue per delay: RabbitMQ expires only the message at the
 * head of a queue, so a single retry queue with an expiry on each message held a short
 * wait behind a long one.
 */
export const retryQueueFor = (queue: string, delayMs: number): string =>
  `${queue}.retry.${delayMs}`;

/**
 * The retry queue for one delay. Every message in it waits the same time, the queue's
 * own TTL, so it stays in order. On expiry it dead-letters through the default exchange
 * straight back to the queue that failed it, not through the jobs exchange to every
 * queue bound to its routing key. No consumer reads it. The consumer declares the tier
 * before it republishes (idempotent), so a new delay needs no topology change.
 */
export const assertRetryTier = async (
  channel: Pick<Channel, "assertQueue">,
  queue: string,
  delayMs: number,
): Promise<void> => {
  await channel.assertQueue(retryQueueFor(queue, delayMs), {
    durable: true,
    arguments: {
      "x-message-ttl": delayMs,
      "x-dead-letter-exchange": "",
      "x-dead-letter-routing-key": queue,
    },
  });
};

/**
 * A queue a consumer reads, bound to the jobs exchange and dead-lettering to parking.
 * Every work queue is declared here, so no two can differ in how they park. Its retry
 * queues are declared as they are needed (`assertRetryTier`).
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
  await assertWorkQueue(
    channel,
    QUEUES.AUTH_SEND_INVITE_EMAIL,
    ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL,
  );

  // Parking lot — no consumer, monitored for depth > 0
  await channel.assertQueue(QUEUES.PARKING, { durable: true });
  await channel.bindQueue(QUEUES.PARKING, EXCHANGES.PARKING, "#");
};
