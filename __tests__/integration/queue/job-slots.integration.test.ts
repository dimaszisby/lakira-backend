import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { randomUUID } from "node:crypto";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import { JobSlots } from "@/shared/infrastructure/queue/JobSlots.js";
import {
  QUEUES,
  assertTopology,
} from "@/shared/infrastructure/queue/topology.js";
import type {
  MessagePayload,
  PublishOptions,
} from "@/shared/application/ports/MessageQueuePort.js";
import { awaitBroker } from "../helpers/broker.js";

/**
 * #310 (audit 2026-11-14, X62; ADR-0100), against a broker. The consumer takes
 * as many messages as its prefetch allows, but runs a job only when one of the
 * worker's slots is free: with one slot, twelve slow jobs run one at a time,
 * and every one is acked with none sent to a retry queue.
 */
const QUEUE = QUEUES.METRIC_LOG_GENERATE_DUMMY;
const JOBS = 12;
const JOB_MS = 150;
const TIMEOUT_MS = 15_000;

describe("RabbitMQConsumer with one job slot, against a broker", () => {
  let inspector: ChannelWrapper;
  let publisher: RabbitMQPublisher;
  let consumer: RabbitMQConsumer | null = null;

  const until = async (check: () => Promise<boolean>, what: string) => {
    const deadline = Date.now() + TIMEOUT_MS;
    while (!(await check())) {
      if (Date.now() > deadline)
        throw new Error(`Timed out waiting for ${what}.`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  beforeAll(async () => {
    try {
      await awaitBroker(5_000);
    } catch (error) {
      await disconnectRabbitMQ();
      throw new Error(
        `RabbitMQ is not reachable (${String(error)}). Start it with \`docker compose up -d rabbitmq\`.`,
      );
    }
    publisher = new RabbitMQPublisher();
    inspector = connectRabbitMQ().createChannel({
      name: "test-job-slots-inspector",
      setup: (ch: Channel) => assertTopology(ch),
    });
    await inspector.waitForConnect();
    await inspector.purgeQueue(QUEUE);
    if ((await inspector.checkQueue(QUEUE)).consumerCount !== 0) {
      throw new Error(
        `Another consumer is attached to ${QUEUE}. Stop it first (locally: \`docker compose stop worker\`).`,
      );
    }
  });

  afterAll(async () => {
    await consumer?.close();
    await inspector?.purgeQueue(QUEUE);
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  it(
    "runs the jobs one at a time, acks every one, and retries none",
    async () => {
      let running = 0;
      let mostRunning = 0;
      let done = 0;
      const retries: PublishOptions[] = [];

      consumer = new RabbitMQConsumer({
        slots: new JobSlots(1),
        queue: QUEUE,
        handler: async () => {
          running++;
          mostRunning = Math.max(mostRunning, running);
          await new Promise((resolve) => setTimeout(resolve, JOB_MS));
          running--;
          done++;
        },
        // Anything sent here would be a retry.
        publisher: {
          isEnabled: () => true,
          publish: async (
            exchange: string,
            payload: MessagePayload,
            options: PublishOptions,
          ) => {
            retries.push(options);
            await publisher.publish(exchange, payload, options);
          },
          close: async () => undefined,
        },
      });
      await until(
        async () => (await inspector.checkQueue(QUEUE)).consumerCount === 1,
        "the consumer to register",
      );

      for (let i = 0; i < JOBS; i++) {
        await inspector.sendToQueue(QUEUE, Buffer.from("{}"), {
          messageId: randomUUID(),
          persistent: false,
        });
      }
      await until(async () => done === JOBS, "every job to finish");
      await until(
        async () => (await inspector.checkQueue(QUEUE)).messageCount === 0,
        "the queue to empty",
      );

      expect(mostRunning).toBe(1);
      expect(retries).toEqual([]);
    },
    TIMEOUT_MS * 2,
  );

  // Two consumers share one slot, as the worker's consumers share theirs: the
  // second holds a message waiting for it. Shutting down returns that message
  // to the queue unstarted, and sends nothing to a retry queue.
  it(
    "at shutdown, returns a message still waiting for a slot to the queue",
    async () => {
      await consumer?.close();
      consumer = null;
      await inspector.purgeQueue(QUEUE);

      const slots = new JobSlots(1);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let started = 0;
      const retries: PublishOptions[] = [];
      const options = {
        slots,
        queue: QUEUE,
        handler: async () => {
          started++;
          await held;
        },
        publisher: {
          isEnabled: () => true,
          publish: async (
            _exchange: string,
            _payload: MessagePayload,
            options: PublishOptions,
          ) => {
            retries.push(options);
          },
          close: async () => undefined,
        },
      };
      const first = new RabbitMQConsumer(options);
      const second = new RabbitMQConsumer(options);
      await until(
        async () => (await inspector.checkQueue(QUEUE)).consumerCount === 2,
        "both consumers to register",
      );

      for (let i = 0; i < 3; i++) {
        await inspector.sendToQueue(QUEUE, Buffer.from("{}"), {
          messageId: randomUUID(),
          persistent: false,
        });
      }
      await until(
        async () => started === 1 && slots.waiting === 1,
        "one job running and one waiting",
      );

      const closing = Promise.all([first.close(), second.close()]);
      release();
      await closing;

      // The one that ran was acked; the waiter and the one never delivered
      // are back on the queue.
      expect(started).toBe(1);
      expect(retries).toEqual([]);
      await until(
        async () => (await inspector.checkQueue(QUEUE)).messageCount === 2,
        "the unstarted messages to be back on the queue",
      );
    },
    TIMEOUT_MS * 2,
  );
});
