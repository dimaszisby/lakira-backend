import type { ChannelWrapper } from "amqp-connection-manager";
import { randomUUID } from "node:crypto";
import amqplib from "amqplib";
import { env } from "@/config/envManager.js";
import {
  buildAmqpUrl,
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import { EXCHANGES, QUEUES } from "@/shared/infrastructure/queue/topology.js";
import {
  getRequestId,
  requestIdStorage,
} from "@/shared/middleware/request-id.js";
import { awaitBroker } from "../helpers/broker.js";

/**
 * Kit queue-failure-paths, against a broker (audit 2026-10-20): a channel whose setup fails
 * (X63), a publish nothing routes (X64), and a request id carried over the queue (N4).
 */
const TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;

const until = async (check: () => boolean | Promise<boolean>, what: string) => {
  const deadline = Date.now() + TIMEOUT_MS;
  while (!(await check())) {
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
};

/**
 * Deletes `queue` over a connection of its own. Before the fix the failed setup took the shared
 * connection down with it, and a cleanup through it never ran, leaving the mismatched queue to
 * break every later suite.
 */
const deleteQueueDirectly = async (queue: string) => {
  const connection = await amqplib.connect(buildAmqpUrl(env));
  try {
    const channel = await connection.createChannel();
    await channel.deleteQueue(queue);
    await channel.close();
  } finally {
    await connection.close();
  }
};

describe("the queue's failure paths against a broker", () => {
  let inspector: ChannelWrapper;
  const closing: Array<{ close: () => Promise<void> }> = [];

  beforeAll(async () => {
    try {
      await awaitBroker(TIMEOUT_MS);
    } catch (error) {
      await disconnectRabbitMQ();
      throw new Error(
        `RabbitMQ is not reachable (${String(error)}). Start it with \`docker compose up -d rabbitmq\`.`,
      );
    }
    // Declares nothing of its own: the tests below arrange the broker by hand.
    inspector = connectRabbitMQ().createChannel({ name: "test-failure-paths" });
    await inspector.waitForConnect();
  });

  afterEach(async () => {
    while (closing.length) await closing.pop()!.close();
  });

  afterAll(async () => {
    await inspector.close();
    await disconnectRabbitMQ();
  });

  // X63: a work queue declared with other arguments makes assertTopology fail in setup.
  it("survives a channel whose setup fails, and reports the queue unavailable", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      await deleteQueueDirectly(queue);
      await inspector.assertQueue(queue, {
        durable: true,
        deadLetterExchange: "some.other.exchange",
      });

      const publisher = new RabbitMQPublisher();
      closing.push(publisher);

      await until(() => !publisher.isEnabled(), "the publisher to give up");
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(rejections).toEqual([]);
      // The broker closed the raw channel with an error; the connection stays up.
      expect(connectRabbitMQ().isConnected()).toBe(true);
    } finally {
      process.off("unhandledRejection", onRejection);
      // Leave the queue for assertTopology to declare as it should be.
      await deleteQueueDirectly(queue);
    }
  });

  // X64: the broker returns a mandatory message no queue is bound for, then confirms it.
  it("rejects a publish that nothing routes", async () => {
    const publisher = new RabbitMQPublisher();
    closing.push(publisher);

    await expect(
      publisher.publish(
        EXCHANGES.JOBS,
        { probe: true },
        {
          routingKey: `no.such.route.${randomUUID()}`,
          messageId: randomUUID(),
        },
      ),
    ).rejects.toMatchObject({ name: "UnroutableMessageError" });
  });

  // N4: the worker handles a job under the id of the request that published it.
  it("carries the request id from the publisher to the handler", async () => {
    const queue = `test.request-id.${randomUUID()}`;
    await inspector.assertQueue(queue, { durable: false, autoDelete: true });
    const seen: (string | undefined)[] = [];
    const publisher = new RabbitMQPublisher();
    const consumer = new RabbitMQConsumer({
      queue,
      handler: async () => {
        seen.push(getRequestId());
      },
      publisher,
      maxRetries: 0,
    });
    closing.push(publisher, { close: () => consumer.close(1_000) });
    await until(
      async () => (await inspector.checkQueue(queue)).consumerCount === 1,
      "the consumer to register",
    );

    await requestIdStorage.run("req-n4-1", () =>
      publisher.publish(
        "",
        { probe: true },
        { routingKey: queue, messageId: randomUUID() },
      ),
    );
    await until(() => seen.length === 1, "the job to be handled");

    expect(seen).toEqual(["req-n4-1"]);
  });
});
