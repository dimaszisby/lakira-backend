import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import { api, buildUserPayload } from "../../helpers/test-utils.js";
import { NoopMessageQueue } from "@/shared/infrastructure/queue/NoopMessageQueue.js";
import { buildWiredAuthFeature } from "@/composition/auth.js";
import { overrideAuthFeatureForTest } from "@/features/auth/infrastructure/http/controller.js";
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
  assertTopology,
  retryQueueFor,
} from "@/shared/infrastructure/queue/topology.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import { models } from "@/infrastructure/db/models.js";

/**
 * The queued password-reset email (ADR-0069): POST /auth/forgot-password → jobs
 * exchange → routing key → queue → RabbitMQConsumer → SendPasswordResetEmailHandler
 * → email.
 *
 * The consumer runs in this process with the handler src/worker.ts runs, built by
 * the same wiring (ADR-0056), against a real broker. Only the email sender is a
 * test double, so the email that would be sent can be read and its link followed.
 *
 * Delivery is asynchronous, so every wait polls for an outcome with a bounded
 * timeout. Nothing sleeps a fixed interval.
 */

const QUEUE = QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL;
const RETRY_QUEUE = retryQueueFor(QUEUE);
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 50;
const RETRY_BASE_DELAY_MS = 50;

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

describe("The password-reset email via RabbitMQ", () => {
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

  const useServer = (queue: MessageQueuePort) =>
    overrideAuthFeatureForTest(
      buildWiredAuthFeature({ messageQueue: queue, emailSender: sender }),
    );

  /** The worker's side: the handler src/worker.ts builds, with this test's sender. */
  const startConsumer = (retry: { maxRetries?: number } = {}) => {
    const { sendPasswordResetEmailHandler: handler } = buildWiredAuthFeature({
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

  /**
   * A registered user. Registered with the queue off, so its verification email
   * is sent here and queues nothing; the reset queue is the only one in play.
   */
  const register = async () => {
    useServer(new NoopMessageQueue());
    const payload = buildUserPayload();
    const res = await api.post("/api/v1/auth/register").send(payload);
    expect(res.status).toBe(201);
    await drainBackgroundTasks();
    useServer(queueOn());
    sender.sent = [];
    sender.calls = 0;
    return {
      userId: res.body.data.user.id as string,
      email: payload.email as string,
      password: payload.password as string,
    };
  };

  const forgot = async (email: string) => {
    const res = await api.post("/api/v1/auth/forgot-password").send({ email });
    expect(res.status).toBe(200);
    return res;
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
      setup: (ch: Channel) => assertTopology(ch),
    });
    await inspector.waitForConnect();
  });

  beforeEach(async () => {
    // A message left behind by an aborted earlier run must not leak into this one.
    await inspector.purgeQueue(QUEUE);
    await inspector.purgeQueue(RETRY_QUEUE);
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
    overrideAuthFeatureForTest(buildWiredAuthFeature());
    await stopConsumer();
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  // AC-1 and AC-2.
  it("queues the user id only, and the worker's link resets the password", async () => {
    const { userId, email } = await register();

    const res = await forgot(email);
    expect(res.body.message).toMatch(/reset instructions/i);

    // Nothing consumes yet: the job waits in the queue, and nothing was sent.
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    expect(sender.calls).toBe(0);
    expect(await models.PasswordResetToken.count({ where: { userId } })).toBe(
      0,
    );

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

    const newPassword = "BrandNewPass123!";
    const reset = await api.post("/api/v1/auth/reset-password").send({
      token: tokenFrom(sender.sent[0]),
      password: newPassword,
      passwordConfirmation: newPassword,
    });
    expect(reset.status).toBe(200);

    const login = await api
      .post("/api/v1/auth/login")
      .send({ email, password: newPassword });
    expect(login.status).toBe(200);
  });

  // AC-1, the unknown address.
  it("queues nothing for an unknown address, and answers the same", async () => {
    const res = await forgot("nobody-here@example.com");

    expect(res.body.message).toMatch(/reset instructions/i);
    expect(await depth(QUEUE)).toBe(0);
    expect(sender.calls).toBe(0);
  });

  // AC-3, first half.
  it("retries a failed send, and sends once when the retry succeeds", async () => {
    const { userId, email } = await register();
    sender.failing = [1];
    startConsumer({ maxRetries: 2 });

    await forgot(email);

    await pollUntil(
      "the retried email",
      () => sender.sent.length,
      (n) => n === 1,
    );
    expect(invocations).toBe(2);
    expect(await depth(QUEUES.PARKING)).toBe(0);

    // The token minted by the failed attempt rolled back with it (D-02): one
    // row, and the link that was sent is the one that works.
    expect(await models.PasswordResetToken.count({ where: { userId } })).toBe(
      1,
    );
    const newPassword = "BrandNewPass123!";
    const reset = await api.post("/api/v1/auth/reset-password").send({
      token: tokenFrom(sender.sent[0]),
      password: newPassword,
      passwordConfirmation: newPassword,
    });
    expect(reset.status).toBe(200);
  });

  // AC-3, second half.
  it("parks the job when every attempt fails", async () => {
    const { email } = await register();
    sender.failing = "always";
    startConsumer({ maxRetries: 1 });

    await forgot(email);

    await pollUntil(
      "the job to park",
      () => depth(QUEUES.PARKING),
      (n) => n === 1,
    );
    expect(invocations).toBe(2);
    expect(sender.sent).toHaveLength(0);
  });

  // AC-4.
  it("sends one email when the same message is delivered twice", async () => {
    const { userId, email } = await register();
    await forgot(email);
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
      { routingKey: ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL, messageId },
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

  // AC-5.
  it("sends in the request when the publish fails, and answers the same", async () => {
    const { email } = await register();
    useServer({
      isEnabled: () => true,
      publish: async () => {
        throw new Error("Timeout");
      },
      close: async () => undefined,
    });

    const res = await forgot(email);

    expect(res.body.message).toMatch(/reset instructions/i);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].to).toBe(email);
    expect(await depth(QUEUE)).toBe(0);
  });
});
