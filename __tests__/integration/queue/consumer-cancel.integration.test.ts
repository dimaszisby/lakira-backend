import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { randomUUID } from "node:crypto";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import {
  QUEUES,
  assertTopology,
} from "@/shared/infrastructure/queue/topology.js";

/**
 * worker-cancel-and-one-connection-per-job D-01 (audit 2026-10-20, X60). The
 * worker's shutdown cancels its consumers and then drains; a cancel that the
 * broker never sees leaves the consumer taking deliveries through the drain.
 * Read from the broker, not from the consumer's own log line.
 */
const QUEUE = QUEUES.METRIC_LOG_GENERATE_DUMMY;
const CONNECT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;

describe("RabbitMQConsumer.cancel against a broker", () => {
  let inspector: ChannelWrapper;
  let publisher: RabbitMQPublisher;
  let consumer: RabbitMQConsumer | null = null;
  let handled = 0;

  const consumers = async () =>
    (await inspector.checkQueue(QUEUE)).consumerCount;

  const until = async (check: () => Promise<boolean>, what: string) => {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (!(await check())) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}.`);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  };

  beforeAll(async () => {
    try {
      await connectRabbitMQ().connect({ timeout: CONNECT_TIMEOUT_MS });
    } catch (error) {
      await disconnectRabbitMQ();
      throw new Error(
        `RabbitMQ is not reachable (${String(error)}). Start it with \`docker compose up -d rabbitmq\`.`,
      );
    }
    publisher = new RabbitMQPublisher();
    inspector = connectRabbitMQ().createChannel({
      name: "test-cancel-inspector",
      setup: (ch: Channel) => assertTopology(ch),
    });
    await inspector.waitForConnect();
  });

  beforeEach(async () => {
    await inspector.purgeQueue(QUEUE);
    handled = 0;
    if ((await consumers()) !== 0) {
      throw new Error(
        `Another consumer is attached to ${QUEUE}. Stop it first (locally: \`docker compose stop worker\`).`,
      );
    }
    consumer = new RabbitMQConsumer({
      queue: QUEUE,
      handler: async () => {
        handled++;
      },
      publisher,
    });
    await until(
      async () => (await consumers()) === 1,
      "the consumer to register",
    );
  });

  afterEach(async () => {
    await consumer?.close();
    consumer = null;
    await inspector.purgeQueue(QUEUE);
  });

  afterAll(async () => {
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  it("leaves no consumer on the queue while its channel is still open", async () => {
    await consumer!.cancel();

    expect(await consumers()).toBe(0);
  });

  it("takes no message published after cancel", async () => {
    await consumer!.cancel();

    await inspector.sendToQueue(
      QUEUE,
      Buffer.from(JSON.stringify({ probe: true })),
      { messageId: randomUUID(), persistent: false },
    );
    await until(
      async () => (await inspector.checkQueue(QUEUE)).messageCount === 1,
      "the message to reach the queue",
    );
    // Long enough for a consumer still attached to have taken it.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(handled).toBe(0);
    expect((await inspector.checkQueue(QUEUE)).messageCount).toBe(1);
  });
});
