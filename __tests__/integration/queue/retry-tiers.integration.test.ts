import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { randomUUID } from "crypto";
import { APP_SHORT_NAME } from "@/config/app-name.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import {
  RETRY_COUNT_HEADER,
  retryDelayMs,
} from "@/shared/infrastructure/queue/retryPolicy.js";
import {
  EXCHANGES,
  assertTopology,
  assertWorkQueue,
  retryQueueFor,
} from "@/shared/infrastructure/queue/topology.js";
import { awaitBroker } from "../helpers/broker.js";

/**
 * Kit queue-design-hardening, D-02 (audit 2026-09-29, R8). RabbitMQ expires only the
 * message at the head of a queue. With one retry queue per work queue and an expiry on
 * each message, a retry due in 200 ms waited behind one due in 1.6 s. Each delay now has
 * a queue of its own, so the short retry comes back first.
 *
 * A queue of this test's own, so no real handler or worker is involved.
 */
const QUEUE = `${APP_SHORT_NAME}.test.retry-tiers`;
const ROUTING_KEY = "test.retry-tiers";
const BASE_DELAY_MS = 200;
const LONG_RETRY_COUNT = 3; // 200 × 2^3 = 1600 ms
const MAX_RETRIES = 5;
const TIMEOUT_MS = 10_000;

describe("retries wait in a queue per delay", () => {
  let publisher: RabbitMQPublisher;
  let inspector: ChannelWrapper;
  let consumer: RabbitMQConsumer | null = null;

  const tiers = [0, LONG_RETRY_COUNT].map((count) =>
    retryQueueFor(QUEUE, retryDelayMs(count, BASE_DELAY_MS)),
  );

  beforeAll(async () => {
    await awaitBroker(TIMEOUT_MS);
    publisher = new RabbitMQPublisher();
    inspector = connectRabbitMQ().createChannel({
      name: "test-retry-tiers",
      setup: async (ch: Channel) => {
        await assertTopology(ch);
        await assertWorkQueue(ch, QUEUE, ROUTING_KEY);
      },
    });
    await inspector.waitForConnect();
    await inspector.purgeQueue(QUEUE);
  });

  afterAll(async () => {
    await consumer?.close();
    for (const queue of [QUEUE, ...tiers]) {
      await inspector.deleteQueue(queue).catch(() => undefined);
    }
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  it("brings a short retry back before a long one scheduled ahead of it", async () => {
    const attempts = new Map<string, number>();
    const retried: string[] = [];

    consumer = new RabbitMQConsumer({
      queue: QUEUE,
      publisher,
      maxRetries: MAX_RETRIES,
      retryBaseDelayMs: BASE_DELAY_MS,
      handler: async (msg) => {
        const id = String(msg.properties.messageId);
        const seen = (attempts.get(id) ?? 0) + 1;
        attempts.set(id, seen);
        if (seen === 1) throw new Error("fail once, so it is retried");
        retried.push(JSON.parse(msg.content.toString()).name as string);
      },
    });

    // The long one fails first, so under one retry queue it sat at the head.
    const send = (name: string, retryCount: number) =>
      publisher.publish(
        EXCHANGES.JOBS,
        { name },
        {
          routingKey: ROUTING_KEY,
          messageId: randomUUID(),
          headers: { [RETRY_COUNT_HEADER]: retryCount },
        },
      );
    await send("long", LONG_RETRY_COUNT);
    await send("short", 0);

    const deadline = Date.now() + TIMEOUT_MS;
    while (retried.length < 2 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(retried).toEqual(["short", "long"]);
    // Each waited in the queue of its own delay, which is empty again.
    for (const tier of tiers) {
      expect((await inspector.checkQueue(tier)).messageCount).toBe(0);
    }
  });
});
