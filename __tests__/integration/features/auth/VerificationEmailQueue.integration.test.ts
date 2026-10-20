import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { buildUserPayload } from "../../helpers/test-utils.js";
import { appWith } from "../../helpers/app-with.js";
import { buildWiredAuthFeature } from "@/composition/auth.js";
import type {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import {
  connectRabbitMQ,
  disconnectRabbitMQ,
} from "@/shared/infrastructure/queue/RabbitMQConnection.js";
import { RabbitMQConsumer } from "@/shared/infrastructure/queue/RabbitMQConsumer.js";
import { RabbitMQPublisher } from "@/shared/infrastructure/queue/RabbitMQPublisher.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
  assertRetryTier,
  assertTopology,
  retryQueueFor,
} from "@/shared/infrastructure/queue/topology.js";
import { retryDelaysMs } from "@/shared/infrastructure/queue/retryPolicy.js";
import { env } from "@/config/envManager.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import { models } from "@/infrastructure/db/models.js";

/**
 * The queued verification email (ADR-0067): POST /auth/register → jobs exchange →
 * routing key → queue → RabbitMQConsumer → SendVerificationEmailHandler → email.
 *
 * The consumer runs in this process with the handler src/worker.ts runs, built by
 * the same wiring (ADR-0056), against a real broker. Only the email sender is a
 * test double, so the email that would be sent can be read and its link followed.
 *
 * Delivery is asynchronous, so every wait polls for an outcome with a bounded
 * timeout. Nothing sleeps a fixed interval.
 */

// An app of this file's own, rebuilt with a replaced feature where a test needs
// one (inject-features-into-routers D-05).
let api = appWith({});

const QUEUE = QUEUES.AUTH_SEND_VERIFICATION_EMAIL;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 50;
const RETRY_BASE_DELAY_MS = 50;
// One retry queue per delay (queue-design-hardening D-02): every one this file's
// consumer can use. The inspector declares them, so a purge or a depth check finds each.
const RETRY_DELAYS_MS = retryDelaysMs(
  env.RABBITMQ_MAX_RETRIES,
  RETRY_BASE_DELAY_MS,
);
const RETRY_QUEUES = RETRY_DELAYS_MS.map((ms) => retryQueueFor(QUEUE, ms));

const pollUntil = async <T>(
  what: string,
  read: () => Promise<T> | T,
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

/** Records what would be sent; fails the calls it is told to, 1-based. */
class CapturingEmailSender implements EmailSender {
  sent: EmailMessage[] = [];
  calls = 0;
  failing: "always" | number[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.calls++;
    if (this.failing === "always" || this.failing.includes(this.calls)) {
      throw new Error(`injected send failure on call #${this.calls}`);
    }
    this.sent.push(message);
  }
}

const tokenFrom = (message: EmailMessage): string =>
  decodeURIComponent(message.text.split("?token=")[1].split(/\s/)[0]);

describe("The verification email via RabbitMQ", () => {
  let publisher: RabbitMQPublisher;
  let inspector: ChannelWrapper;
  let consumer: RabbitMQConsumer | null = null;
  let sender: CapturingEmailSender;
  /** Handler invocations since the test began — one per delivery, retries included. */
  let invocations = 0;

  // RabbitMQPublisher.isEnabled() reads RABBITMQ_ENABLED, which is false in test.
  // This is the one seam: it takes the queue branch with the real publisher.
  const queueOn = (): MessageQueuePort => ({
    isEnabled: () => true,
    publish: (exchange, payload, options) =>
      publisher.publish(exchange, payload, options),
    close: async () => undefined,
  });

  const useServer = (queue: MessageQueuePort) => {
    api = appWith({
      auth: buildWiredAuthFeature({ messageQueue: queue, emailSender: sender }),
    });
  };

  /** The worker's side: the handler src/worker.ts builds, with this test's sender. */
  const startConsumer = (retry: { maxRetries?: number } = {}) => {
    const { sendVerificationEmailHandler: handler } = buildWiredAuthFeature({
      emailSender: sender,
    });
    consumer = new RabbitMQConsumer({
      queue: QUEUE,
      handler: (msg, context) => {
        invocations++;
        return handler.handle(msg, context);
      },
      publisher,
      retryBaseDelayMs: RETRY_BASE_DELAY_MS,
      ...retry,
    });
  };

  const stopConsumer = async () => {
    if (!consumer) return;
    await consumer.close();
    consumer = null;
  };

  const depth = async (queue: string) =>
    (await inspector.checkQueue(queue)).messageCount;

  /** Reads the one queued message and puts it back. */
  const peek = async () => {
    const msg = await inspector.get(QUEUE, { noAck: false });
    if (!msg) throw new Error("Expected a message in the queue.");
    inspector.nack(msg, false, true);
    return msg;
  };

  const register = async () => {
    const payload = buildUserPayload();
    const res = await api.post("/api/v1/auth/register").send(payload);
    expect(res.status).toBe(201);
    return { userId: res.body.data.user.id as string, email: payload.email };
  };

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
      setup: async (ch: Channel) => {
        await assertTopology(ch);
        for (const ms of RETRY_DELAYS_MS) await assertRetryTier(ch, QUEUE, ms);
      },
    });
    await inspector.waitForConnect();
  });

  beforeEach(async () => {
    // A message left behind by an aborted earlier run must not leak into this one.
    await inspector.purgeQueue(QUEUE);
    for (const queue of RETRY_QUEUES) await inspector.purgeQueue(queue);
    await inspector.purgeQueue(QUEUES.PARKING);
    invocations = 0;
    sender = new CapturingEmailSender();
    useServer(queueOn());

    const { consumerCount } = await inspector.checkQueue(QUEUE);
    if (consumerCount !== 0) {
      throw new Error(
        `${consumerCount} other consumer(s) are attached to ${QUEUE} and would ` +
          "take this test's messages. Stop them first (locally: `docker compose stop worker`).",
      );
    }
  });

  afterEach(async () => {
    await stopConsumer();
  });

  afterAll(async () => {
    api = appWith({});
    await stopConsumer();
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  // AC-1 and AC-6.
  it("queues the user id only, and the worker's email verifies the account", async () => {
    const { userId, email } = await register();

    // Nothing consumes yet: the job waits in the queue, and nothing went in process.
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    await drainBackgroundTasks();
    expect(sender.calls).toBe(0);

    const queued = await peek();
    expect(JSON.parse(queued.content.toString())).toEqual({ userId });
    expect(queued.content.toString()).not.toContain(email);
    expect(typeof queued.properties.messageId).toBe("string");

    startConsumer();
    await pollUntil(
      "one email",
      () => sender.sent.length,
      (n) => n === 1,
    );
    expect(sender.sent[0].to).toBe(email);

    const verified = await api
      .post("/api/v1/auth/verify-email")
      .send({ token: tokenFrom(sender.sent[0]) });
    expect(verified.status).toBe(200);
  });

  // AC-2, first half.
  it("retries a failed send, and sends once when the retry succeeds", async () => {
    sender.failing = [1];
    startConsumer({ maxRetries: 2 });

    const { userId } = await register();

    await pollUntil(
      "the retried email",
      () => sender.sent.length,
      (n) => n === 1,
    );
    expect(invocations).toBe(2);
    expect(await depth(QUEUES.PARKING)).toBe(0);

    // The token minted by the failed attempt rolled back with it (D-03): one
    // row, and the link that was sent is the one that works.
    expect(
      await models.EmailVerificationToken.count({ where: { userId } }),
    ).toBe(1);
    const verified = await api
      .post("/api/v1/auth/verify-email")
      .send({ token: tokenFrom(sender.sent[0]) });
    expect(verified.status).toBe(200);
  });

  // AC-2, second half.
  it("parks the job when every attempt fails", async () => {
    sender.failing = "always";
    startConsumer({ maxRetries: 1 });

    await register();

    await pollUntil(
      "the job to park",
      () => depth(QUEUES.PARKING),
      (n) => n === 1,
    );
    expect(invocations).toBe(2);
    expect(sender.sent).toHaveLength(0);
  });

  // AC-3.
  it("sends one email when the same message is delivered twice", async () => {
    const { userId } = await register();
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    const { messageId } = (await peek()).properties;

    startConsumer();
    await pollUntil(
      "one email",
      () => sender.sent.length,
      (n) => n === 1,
    );

    await publisher.publish(
      EXCHANGES.JOBS,
      { userId },
      { routingKey: ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL, messageId },
    );
    await pollUntil(
      "the redelivery",
      () => invocations,
      (n) => n === 2,
    );
    await pollUntil(
      "the queue to empty",
      () => depth(QUEUE),
      (n) => n === 0,
    );

    expect(sender.sent).toHaveLength(1);
  });

  // AC-4.
  it("sends in process when the publish fails, and still answers 201", async () => {
    useServer({
      isEnabled: () => true,
      publish: async () => {
        throw new Error("Timeout");
      },
      close: async () => undefined,
    });

    const { email } = await register();
    await drainBackgroundTasks();

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(email);
    expect(await depth(QUEUE)).toBe(0);
  });

  // AC-1 for resend: the same job, for a signed-in user.
  it("queues the email on resend too", async () => {
    const payload = buildUserPayload();
    const reg = await api.post("/api/v1/auth/register").send(payload);
    await pollUntil(
      "the first job",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    await inspector.purgeQueue(QUEUE);

    const res = await api
      .post("/api/v1/auth/resend-verification")
      .set("Authorization", `Bearer ${reg.body.data.token as string}`);
    expect(res.status).toBe(200);

    await pollUntil(
      "the resend job",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    expect(JSON.parse((await peek()).content.toString())).toEqual({
      userId: reg.body.data.user.id,
    });
  });
});
