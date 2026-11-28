import { jest } from "@jest/globals";
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
import { JobSlots } from "@/shared/infrastructure/queue/JobSlots.js";

/**
 * Kit queue-failure-paths, against a broker (audit 2026-10-20): a channel whose setup fails
 * (X63), a publish nothing routes (X64), and a request id carried over the queue (N4). Then
 * #312 (audit 2026-11-14 Y61): a channel the broker closes is opened again (ADR-0102).
 */
const TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 50;

const until = async (
  check: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = TIMEOUT_MS,
) => {
  const deadline = Date.now() + timeoutMs;
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

/**
 * The queue's consumer count, or null when it does not exist, over a connection of its own:
 * a passive check of a missing queue closes the channel it runs on.
 */
const consumersOf = async (queue: string): Promise<number | null> => {
  const connection = await amqplib.connect(buildAmqpUrl(env));
  try {
    const channel = await connection.createChannel();
    channel.on("error", () => undefined);
    try {
      return (await channel.checkQueue(queue)).consumerCount;
    } catch {
      return null;
    }
  } finally {
    await connection.close();
  }
};

/** Declares `queue` with another dead-letter exchange, so assertTopology's 406s on it. */
const mismatch = async (inspector: ChannelWrapper, queue: string) => {
  await deleteQueueDirectly(queue);
  await inspector.assertQueue(queue, {
    durable: true,
    deadLetterExchange: "some.other.exchange",
  });
};

// The first reopen waits 1 s; a few attempts fit in this.
const REOPEN_TIMEOUT_MS = 10_000;

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

  // RABBITMQ_ENABLED is false in test, and isEnabled() reads it: with it off, a test that
  // waits for the publisher to give up passed without its channel failing at all.
  beforeEach(() => {
    jest.replaceProperty(env, "RABBITMQ_ENABLED", true);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
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
      slots: new JobSlots(10),
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
  // Y61, the issue's repro: the worker consumed nothing once the broker closed its channel.
  it("reopens a consumer's channel once the broker accepts its declarations again", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    const handled: unknown[] = [];
    try {
      await mismatch(inspector, queue);
      const consumer = new RabbitMQConsumer({
        slots: new JobSlots(10),
        queue,
        handler: async (msg) => {
          handled.push(msg.properties.messageId);
        },
        publisher: {
          isEnabled: () => false,
          publish: async () => undefined,
          close: async () => undefined,
        },
        maxRetries: 0,
      });
      closing.push({ close: () => consumer.close(1_000) });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await consumersOf(queue)).toBe(0);

      await deleteQueueDirectly(queue);
      await until(
        async () => (await consumersOf(queue)) === 1,
        "the consumer to declare its queue and consume again",
        REOPEN_TIMEOUT_MS,
      );

      const messageId = randomUUID();
      await inspector.sendToQueue(queue, Buffer.from("{}"), { messageId });
      await until(() => handled.includes(messageId), "the job to be handled");
      // One consumer, not one per attempt.
      expect(await consumersOf(queue)).toBe(1);
    } finally {
      await deleteQueueDirectly(queue);
    }
  });

  /** A consumer on the dummy-logs queue that records each message id it handles. */
  const recordingConsumer = (queue: string, handled: unknown[]) => {
    const consumer = new RabbitMQConsumer({
      slots: new JobSlots(10),
      queue,
      handler: async (msg) => {
        handled.push(msg.properties.messageId);
      },
      publisher: {
        isEnabled: () => false,
        publish: async () => undefined,
        close: async () => undefined,
      },
      maxRetries: 0,
    });
    closing.push({ close: () => consumer.close(1_000) });
    return consumer;
  };

  // Review M2: a consumed queue deleted at runtime cancels its consumer and leaves the
  // channel open, so before this the worker consumed nothing from it again.
  it("consumes again after the broker cancels the consumer by deleting its queue", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    const handled: unknown[] = [];
    try {
      recordingConsumer(queue, handled);
      await until(
        async () => (await consumersOf(queue)) === 1,
        "the consumer to register",
      );

      await deleteQueueDirectly(queue);
      await until(
        async () => (await consumersOf(queue)) === 1,
        "the consumer to declare its queue and consume again",
        REOPEN_TIMEOUT_MS,
      );

      const messageId = randomUUID();
      await inspector.sendToQueue(queue, Buffer.from("{}"), { messageId });
      await until(() => handled.includes(messageId), "the job to be handled");
      expect(await consumersOf(queue)).toBe(1);
    } finally {
      await deleteQueueDirectly(queue);
    }
  });

  // Review L4: on a reconnect of the whole connection the library sets the channel up
  // itself, and the reopen must not open a second one beside it.
  it("leaves one consumer after the whole connection reconnects", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    const handled: unknown[] = [];
    try {
      recordingConsumer(queue, handled);
      await until(
        async () => (await consumersOf(queue)) === 1,
        "the consumer to register",
      );

      connectRabbitMQ().reconnect();
      await until(
        async () => (await consumersOf(queue)) === 1,
        "the consumer to register again",
        REOPEN_TIMEOUT_MS,
      );
      // Past the first reopen's wait, and the next.
      await new Promise((resolve) => setTimeout(resolve, 3_500));
      expect(await consumersOf(queue)).toBe(1);

      const messageId = randomUUID();
      await inspector.sendToQueue(queue, Buffer.from("{}"), { messageId });
      await until(() => handled.includes(messageId), "the job to be handled");
    } finally {
      await deleteQueueDirectly(queue);
    }
  });

  // Y61: the API's publisher did not redeclare the queue either.
  it("reopens the publisher's channel once the broker accepts its declarations again", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    try {
      await mismatch(inspector, queue);
      const publisher = new RabbitMQPublisher();
      closing.push(publisher);
      await until(() => !publisher.isEnabled(), "the publisher to give up");

      await deleteQueueDirectly(queue);
      await until(
        () => publisher.isEnabled(),
        "the publisher to connect again",
        REOPEN_TIMEOUT_MS,
      );

      await expect(
        publisher.publish(
          "",
          { probe: true },
          { routingKey: queue, messageId: randomUUID() },
        ),
      ).resolves.toBeUndefined();
    } finally {
      await deleteQueueDirectly(queue);
    }
  });

  // #313 (audit 2026-11-14 Y62): a refused channel is reported once per outage, though
  // every reopen attempt fails the same way.
  it("reports a refused publisher channel once while every reopen fails", async () => {
    const queue = QUEUES.METRIC_LOG_GENERATE_DUMMY;
    try {
      await mismatch(inspector, queue);
      // A fresh publisher, connection and all, whose reportError is recorded: the app the
      // setup loads already holds the real one. Nothing is sent.
      const report = jest.fn();
      let failures: ReturnType<typeof jest.spyOn> | undefined;
      await jest.isolateModulesAsync(async () => {
        jest.doMock("@/utils/error-report.js", () => ({
          reportError: report,
          flushErrorReports: jest.fn(async () => undefined),
        }));
        const isolated =
          await import("@/shared/infrastructure/queue/RabbitMQConnection.js");
        const { RabbitMQPublisher: IsolatedPublisher } =
          await import("@/shared/infrastructure/queue/RabbitMQPublisher.js");
        // Every failed setup logs, reported or not: it counts the attempts.
        const { default: isolatedLogger } = await import("@/utils/logger.js");
        failures = jest.spyOn(isolatedLogger, "error");
        closing.push({ close: isolated.disconnectRabbitMQ });
        closing.push(new IsolatedPublisher());
      });
      // The first setup, then attempts after 1 s and 2 s more.
      await new Promise((resolve) => setTimeout(resolve, 3_500));

      const forPublisher = report.mock.calls.filter(
        ([, tags]) => (tags as Record<string, string>).channel === "publisher",
      );
      expect(forPublisher).toHaveLength(1);
      expect(forPublisher[0]![0]).toMatchObject({ code: 406 });
      // The window held the reopens whose failures it absorbed.
      const attempts = failures!.mock.calls.filter(([message]: unknown[]) =>
        String(message).startsWith("[RABBITMQ] Publisher channel failed"),
      );
      expect(attempts.length).toBeGreaterThanOrEqual(3);
    } finally {
      jest.dontMock("@/utils/error-report.js");
      await deleteQueueDirectly(queue);
    }
  });

  // Y61: after a close at runtime the publisher stayed available, and each publish waited
  // out its timeout before the caller fell back.
  it("reports the publisher unavailable once the broker closes its channel, then reopens it", async () => {
    const queue = `test.reopen.${randomUUID()}`;
    await inspector.assertQueue(queue, { durable: false, autoDelete: false });
    const publisher = new RabbitMQPublisher();
    closing.push(publisher, { close: () => deleteQueueDirectly(queue) });
    // Resolves once the channel is up.
    await publisher.publish(
      "",
      { probe: true },
      { routingKey: queue, messageId: randomUUID() },
    );

    // A publish to an exchange that does not exist: the broker closes the channel (404).
    await expect(
      publisher.publish(
        `no.such.exchange.${randomUUID()}`,
        { probe: true },
        { routingKey: "x", messageId: randomUUID() },
      ),
    ).rejects.toBeDefined();
    await until(() => !publisher.isEnabled(), "the publisher to give up");

    await until(
      () => publisher.isEnabled(),
      "the publisher to connect again",
      REOPEN_TIMEOUT_MS,
    );
    await expect(
      publisher.publish(
        "",
        { probe: true },
        { routingKey: queue, messageId: randomUUID() },
      ),
    ).resolves.toBeUndefined();
  });
});
