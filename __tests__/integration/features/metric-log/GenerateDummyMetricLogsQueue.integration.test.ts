import { randomUUID } from "crypto";
import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import {
  api,
  authHeader,
  createMetric,
  createTestUser,
} from "../../helpers/test-utils.js";
import { models } from "@/infrastructure/db/models.js";
import { buildMetricLogFeature } from "@/features/metric-log/feature.js";
import { overrideMetricLogFeatureForTest } from "@/features/metric-log/infrastructure/http/controller.js";
import { GenerateDummyMetricLogsHandler } from "@/features/metric-log/application/use-cases/GenerateDummyMetricLogsHandler.js";
import { MetricLogCacheRedis } from "@/features/metric-log/infrastructure/cache/MetricLogCacheRedis.js";
import { MetricAccessSequelize } from "@/features/metric/infrastructure/providers/MetricAccessSequelize.js";
import { NoopVisualizationInvalidation } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import { SequelizeMessageIdempotency } from "@/shared/infrastructure/queue/SequelizeMessageIdempotency.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
  assertTopology,
} from "@/shared/infrastructure/queue/topology.js";

/**
 * The queued path of POST /metric-logs/:metricId/dummy: publisher → jobs exchange →
 * routing key → queue → RabbitMQConsumer → GenerateDummyMetricLogsHandler → metric_logs.
 *
 * The consumer runs in-process, built exactly as src/worker.ts builds it, against a real
 * broker. Nothing here calls the handler directly; that would prove nothing about
 * topology, bindings, routing or acking.
 *
 * Delivery is asynchronous, so every wait polls for an outcome with a bounded timeout.
 * Nothing sleeps a fixed interval.
 */

const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 50;

const pollUntil = async <T>(
  what: string,
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
): Promise<T> => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = await read();
  while (!isDone(last)) {
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out after ${POLL_TIMEOUT_MS}ms waiting for ${what}; last observed: ${JSON.stringify(last)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    last = await read();
  }
  return last;
};

describe("GenerateDummyMetricLogs via RabbitMQ", () => {
  let publisher: RabbitMQPublisher;
  let inspector: ChannelWrapper;
  let consumer: RabbitMQConsumer | null = null;

  const startConsumer = (): RabbitMQConsumer => {
    const handler = new GenerateDummyMetricLogsHandler(
      new MetricAccessSequelize(),
      new MetricLogCacheRedis(new NoopVisualizationInvalidation()),
      new SequelizeMessageIdempotency(),
    );
    consumer = new RabbitMQConsumer({
      queue: QUEUES.METRIC_LOG_GENERATE_DUMMY,
      handler: (msg, context) => handler.handle(msg, context),
    });
    return consumer;
  };

  const stopConsumer = async (): Promise<void> => {
    if (!consumer) return;
    await consumer.close();
    consumer = null;
  };

  const depth = async (queue: string) => {
    const { messageCount, consumerCount } = await inspector.checkQueue(queue);
    return { messageCount, consumerCount };
  };

  const rowCount = (metricId: string) =>
    models.MetricLog.count({ where: { metricId } });

  /** A valid job for a metric the user owns, published with an explicit messageId. */
  const ownedJob = async (count: number) => {
    const { token, user } = await createTestUser();
    const { metric } = await createMetric(token);
    const metricRow = await models.Metric.findByPk(metric.id);
    const messageId = randomUUID();
    return {
      metricId: metric.id,
      messageId,
      payload: {
        jobId: messageId,
        userId: user.id,
        organizationId: metricRow!.get("organizationId"),
        metricId: metric.id,
        count,
      },
    };
  };

  const publishJob = (payload: Record<string, unknown>, messageId: string) =>
    publisher.publish(EXCHANGES.JOBS, payload, {
      routingKey: ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
      messageId,
    });

  beforeAll(async () => {
    try {
      // Fail fast when no broker is reachable. connect() alone would leave
      // amqp-connection-manager retrying in the background and hang Jest.
      await connectRabbitMQ().connect({ timeout: POLL_TIMEOUT_MS });
    } catch (error) {
      await disconnectRabbitMQ();
      throw new Error(
        `RabbitMQ is not reachable (${String(error)}). Start it with \`docker compose up -d rabbitmq\`.`,
      );
    }

    publisher = new RabbitMQPublisher();
    inspector = connectRabbitMQ().createChannel({
      name: "test-inspector",
      setup: (ch: Channel) => assertTopology(ch),
    });
    await inspector.waitForConnect();

    // RabbitMQPublisher.isEnabled() reads RABBITMQ_ENABLED, which is false in test and
    // cannot be mutated here. This is the only seam: it forces the queue branch.
    // Exchange, routing key, payload and messageId still come from the real use case.
    const queue: MessageQueuePort = {
      isEnabled: () => true,
      publish: (exchange, payload, options) =>
        publisher.publish(exchange, payload, options),
      close: () => publisher.close(),
    };
    overrideMetricLogFeatureForTest(
      buildMetricLogFeature({ messageQueue: queue }),
    );
  });

  beforeEach(async () => {
    // A message left behind by an aborted earlier run must not leak into this one.
    await inspector.purgeQueue(QUEUES.METRIC_LOG_GENERATE_DUMMY);
    await inspector.purgeQueue(QUEUES.PARKING);

    const { consumerCount } = await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY);
    if (consumerCount !== 0) {
      throw new Error(
        `${consumerCount} other consumer(s) are attached to ${QUEUES.METRIC_LOG_GENERATE_DUMMY} ` +
          "and would take this test's messages. Stop them first " +
          "(locally: `docker compose stop worker`).",
      );
    }
  });

  afterEach(async () => {
    await stopConsumer();
  });

  afterAll(async () => {
    overrideMetricLogFeatureForTest(buildMetricLogFeature());
    await stopConsumer();
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  it("publishes to the jobs exchange and the consumer writes the logs", async () => {
    const { token } = await createTestUser();
    const { metric } = await createMetric(token);

    const res = await api
      .post(`/api/v1/metric-logs/${metric.id}/dummy`)
      .set("Authorization", authHeader(token))
      .send({ metricId: metric.id, count: 5 });

    expect(res.status).toBe(202);
    expect(typeof res.body.data.jobId).toBe("string");

    // Nothing is consuming yet. The job must be sitting in the queue, routed there by
    // exchange + routing key, and there must be no rows. The synchronous fallback would
    // already have written all five.
    await pollUntil(
      "the job to be routed to the queue",
      () => depth(QUEUES.METRIC_LOG_GENERATE_DUMMY),
      (d) => d.messageCount === 1,
    );
    expect(await rowCount(metric.id)).toBe(0);

    // Only the consumer can turn the message into rows.
    startConsumer();
    await pollUntil(
      "the consumer to write 5 rows",
      () => rowCount(metric.id),
      (n) => n === 5,
    );

    // close() cancels and drains in-flight work, so the ack/nack has settled. An ack
    // empties both queues. A nack would dead-letter the message to parking, and a
    // missing ack would requeue it to the main queue.
    await stopConsumer();
    expect((await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY)).messageCount).toBe(
      0,
    );
    expect((await depth(QUEUES.PARKING)).messageCount).toBe(0);
    expect(await rowCount(metric.id)).toBe(5);
  });

  it("dead-letters a job the handler rejects to the parking lot", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const { metric } = await createMetric(owner.token);
    const metricRow = await models.Metric.findByPk(metric.id);

    // The handler re-checks ownership. This job names a user who does not own the metric.
    await publisher.publish(
      EXCHANGES.JOBS,
      {
        jobId: "dead-letter-probe",
        userId: intruder.user.id,
        organizationId: metricRow!.get("organizationId"),
        metricId: metric.id,
        count: 3,
      },
      {
        routingKey: ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
        messageId: "dead-letter-probe",
      },
    );

    startConsumer();
    await pollUntil(
      "the rejected job to reach the parking lot",
      () => depth(QUEUES.PARKING),
      (d) => d.messageCount === 1,
    );

    await stopConsumer();
    expect((await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY)).messageCount).toBe(
      0,
    );
    expect(await rowCount(metric.id)).toBe(0);
  });

  describe("idempotency (ADR-0007)", () => {
    it("acks and skips a redelivered message with the same messageId", async () => {
      const { metricId, messageId, payload } = await ownedJob(4);

      // Two deliveries of one message, as a redelivery after a lost ack would produce.
      await publishJob(payload, messageId);
      await publishJob(payload, messageId);
      await pollUntil(
        "both deliveries to be routed to the queue",
        () => depth(QUEUES.METRIC_LOG_GENERATE_DUMMY),
        (d) => d.messageCount === 2,
      );

      startConsumer();
      await pollUntil(
        "both deliveries to be taken by the consumer",
        () => depth(QUEUES.METRIC_LOG_GENERATE_DUMMY),
        (d) => d.messageCount === 0,
      );
      await pollUntil(
        "the consumer to write the first job's rows",
        () => rowCount(metricId),
        (n) => n >= 4,
      );

      // close() drains both deliveries. A skip must be an ack: an empty parking lot
      // means the duplicate was not nacked, an empty main queue that it was not requeued.
      await stopConsumer();
      expect((await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY)).messageCount).toBe(
        0,
      );
      expect((await depth(QUEUES.PARKING)).messageCount).toBe(0);
      expect(await rowCount(metricId)).toBe(4);

      const records = await models.ProcessedMessage.findAll({
        where: { messageId },
      });
      expect(records).toHaveLength(1);
      expect(records[0].queue).toBe(QUEUES.METRIC_LOG_GENERATE_DUMMY);
    });

    it("rolls back the dedup record when the handler fails, so a replay does the work", async () => {
      const { metricId, messageId, payload } = await ownedJob(5);

      // Fail partway through the side effect, after the dedup insert has run.
      const realCreate = models.MetricLog.create.bind(models.MetricLog);
      let calls = 0;
      const createSpy = jest
        .spyOn(models.MetricLog, "create")
        .mockImplementation((async (...args: any[]) => {
          calls++;
          if (calls === 3) throw new Error("injected failure mid-write");
          return (realCreate as any)(...args);
        }) as any);

      try {
        await publishJob(payload, messageId);
        startConsumer();
        await pollUntil(
          "the failed job to reach the parking lot",
          () => depth(QUEUES.PARKING),
          (d) => d.messageCount === 1,
        );
        await stopConsumer();
      } finally {
        createSpy.mockRestore();
      }

      // Nothing committed: neither the two rows written before the failure nor the
      // record that would mark the message processed.
      expect(await rowCount(metricId)).toBe(0);
      expect(
        await models.ProcessedMessage.count({ where: { messageId } }),
      ).toBe(0);

      // Replay the same message, as an operator would from the parking lot. It must do
      // its work rather than be skipped as already processed.
      await publishJob(payload, messageId);
      startConsumer();
      await pollUntil(
        "the replayed job to write 5 rows",
        () => rowCount(metricId),
        (n) => n >= 5,
      );
      await stopConsumer();

      expect(await rowCount(metricId)).toBe(5);
      expect((await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY)).messageCount).toBe(
        0,
      );
      // Still only the original failed copy; the replay was acked.
      expect((await depth(QUEUES.PARKING)).messageCount).toBe(1);
      expect(
        await models.ProcessedMessage.count({ where: { messageId } }),
      ).toBe(1);
    });

    it("parks a message that carries no messageId", async () => {
      const { metricId, payload } = await ownedJob(3);

      // RabbitMQPublisher always sets a messageId, so publish around it.
      await inspector.publish(
        EXCHANGES.JOBS,
        ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
        Buffer.from(JSON.stringify(payload)),
        { persistent: true, contentType: "application/json" },
      );

      startConsumer();
      await pollUntil(
        "the unidentifiable job to reach the parking lot",
        () => depth(QUEUES.PARKING),
        (d) => d.messageCount === 1,
      );
      await stopConsumer();

      expect((await depth(QUEUES.METRIC_LOG_GENERATE_DUMMY)).messageCount).toBe(
        0,
      );
      expect(await rowCount(metricId)).toBe(0);
      expect(await models.ProcessedMessage.count()).toBe(0);
    });
  });
});
