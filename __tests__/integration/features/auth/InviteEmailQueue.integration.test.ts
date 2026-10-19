import type { ChannelWrapper } from "amqp-connection-manager";
import type { Channel } from "amqplib";
import {
  authHeader,
  buildUserPayload,
  createTestUser,
} from "../../helpers/test-utils.js";
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
  assertTopology,
  retryQueueFor,
} from "@/shared/infrastructure/queue/topology.js";
import { models } from "@/infrastructure/db/models.js";
import { createHash } from "node:crypto";

/**
 * The queued invite email (ADR-0070): POST /organizations/:id/invites → jobs
 * exchange → routing key → queue → RabbitMQConsumer → SendInviteEmailHandler →
 * email.
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

const QUEUE = QUEUES.AUTH_SEND_INVITE_EMAIL;
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

const tokenFrom = (message: EmailMessage): string => {
  const match = message.html.match(/token=([^"&<\s]+)/);
  if (!match) throw new Error("No token found in the email.");
  return decodeURIComponent(match[1]);
};

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const decodeOrgId = (token: string): string =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
    .organizationId;

describe("The invite email via RabbitMQ", () => {
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
    const { sendInviteEmailHandler: handler } = buildWiredAuthFeature({
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

  /** An owner, the organization their token names, and an address to invite. */
  const owner = async () => {
    const { token } = await createTestUser();
    const invitee = buildUserPayload();
    return {
      token,
      orgId: decodeOrgId(token),
      email: invitee.email as string,
      username: invitee.username as string,
    };
  };

  const invite = (token: string, orgId: string, email: string) =>
    api
      .post(`/api/v1/organizations/${orgId}/invites`)
      .set("Authorization", authHeader(token))
      .send({ email, role: "member" });

  const invitesFor = (organizationId: string) =>
    models.OrganizationInvite.findAll({ where: { organizationId } });

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
    api = appWith({});
    await stopConsumer();
    await publisher?.close();
    await inspector?.close();
    await disconnectRabbitMQ();
  });

  // AC-1 and AC-2.
  it("queues the invite id only, and the worker's link accepts the invite", async () => {
    const { token, orgId, email, username } = await owner();

    const res = await invite(token, orgId, email);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Invitation sent successfully");

    // Nothing consumes yet: the job waits in the queue, and nothing was sent.
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    expect(sender.calls).toBe(0);
    const [row] = await invitesFor(orgId);

    const queued = await peek();
    expect(JSON.parse(queued.content.toString())).toEqual({
      inviteId: row.id,
    });
    expect(queued.content.toString()).not.toContain(email);
    expect(typeof queued.properties.messageId).toBe("string");

    startConsumer();
    await pollUntil(
      "one email",
      () => sender.sent.length,
      (n) => n === 1,
    );
    expect(sender.sent[0].to).toBe(email);

    const invitee = await createTestUser({ email, username });
    const accept = await api
      .post("/api/v1/invites/accept")
      .set("Authorization", authHeader(invitee.token))
      .send({ token: tokenFrom(sender.sent[0]) });
    expect(accept.status).toBe(200);
  });

  // AC-3, first half.
  it("retries a failed send, and the stored hash is the emailed token's", async () => {
    const { token, orgId, email } = await owner();
    sender.failing = [1];
    startConsumer({ maxRetries: 2 });

    expect((await invite(token, orgId, email)).status).toBe(201);

    await pollUntil(
      "the retried email",
      () => sender.sent.length,
      (n) => n === 1,
    );
    expect(invocations).toBe(2);
    expect(await depth(QUEUES.PARKING)).toBe(0);

    // The hash written by the failed attempt rolled back with it (D-02): the
    // row holds the hash of the token that was sent.
    const rows = await invitesFor(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(sha256(tokenFrom(sender.sent[0])));
  });

  // AC-3, second half.
  it("parks the job when every attempt fails", async () => {
    const { token, orgId, email } = await owner();
    sender.failing = "always";
    startConsumer({ maxRetries: 1 });

    await invite(token, orgId, email);

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
    const { token, orgId, email } = await owner();
    await invite(token, orgId, email);
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    const queued = await peek();
    const { messageId } = queued.properties;

    startConsumer();
    await pollUntil(
      "one email",
      () => sender.sent.length,
      (n) => n === 1,
    );

    await publisher.publish(
      EXCHANGES.JOBS,
      JSON.parse(queued.content.toString()),
      { routingKey: ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL, messageId },
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

  // AC-4, an invite accepted before its job runs.
  it("sends nothing for an invite already accepted", async () => {
    const { token, orgId, email } = await owner();
    await invite(token, orgId, email);
    await pollUntil(
      "the job to be queued",
      () => depth(QUEUE),
      (n) => n === 1,
    );
    await models.OrganizationInvite.update(
      { acceptedAt: new Date() },
      { where: { organizationId: orgId } },
    );

    startConsumer();
    await pollUntil(
      "the queue to empty",
      () => depth(QUEUE),
      (n) => n === 0,
    );
    await pollUntil(
      "the delivery",
      () => invocations,
      (n) => n === 1,
    );

    expect(sender.calls).toBe(0);
    expect(await depth(QUEUES.PARKING)).toBe(0);
  });

  // AC-6.
  describe("when the publish fails", () => {
    const publishFails = (): MessageQueuePort => ({
      isEnabled: () => true,
      publish: async () => {
        throw new Error("Timeout");
      },
      close: async () => undefined,
    });

    it("sends in the request, with a link that works", async () => {
      const { token, orgId, email, username } = await owner();
      useServer(publishFails());

      expect((await invite(token, orgId, email)).status).toBe(201);

      expect(sender.sent).toHaveLength(1);
      expect(await depth(QUEUE)).toBe(0);
      const invitee = await createTestUser({ email, username });
      const accept = await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: tokenFrom(sender.sent[0]) });
      expect(accept.status).toBe(200);
    });

    // durable-invite-email D-03: nobody received it, so a retry is not a 409.
    it("leaves no invite when the send fails too, so a retry succeeds", async () => {
      const { token, orgId, email } = await owner();
      useServer(publishFails());
      sender.failing = [1];

      expect((await invite(token, orgId, email)).status).toBe(500);
      expect(await invitesFor(orgId)).toHaveLength(0);

      expect((await invite(token, orgId, email)).status).toBe(201);
      expect(sender.sent).toHaveLength(1);
    });
  });
});
