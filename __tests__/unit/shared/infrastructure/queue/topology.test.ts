import { describe, it, expect, jest } from "@jest/globals";
import type { Channel } from "amqplib";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
  assertRetryTier,
  assertTopology,
  retryQueueFor,
} from "@/shared/infrastructure/queue/topology.js";

const fakeChannel = () => {
  const ch = {
    assertExchange: jest.fn(async (..._args: unknown[]) => ({})),
    assertQueue: jest.fn(async (..._args: unknown[]) => ({})),
    bindQueue: jest.fn(async (..._args: unknown[]) => ({})),
  };
  return ch;
};

/** Every argument a queue was declared with, keyed by queue name. */
const declared = (ch: ReturnType<typeof fakeChannel>) =>
  Object.fromEntries(
    ch.assertQueue.mock.calls.map(([name, options]) => [name, options]),
  );

const WORK_QUEUES = [
  [QUEUES.METRIC_LOG_GENERATE_DUMMY, ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY],
  [
    QUEUES.AUTH_SEND_VERIFICATION_EMAIL,
    ROUTING_KEYS.AUTH_SEND_VERIFICATION_EMAIL,
  ],
  [
    QUEUES.AUTH_SEND_PASSWORD_RESET_EMAIL,
    ROUTING_KEYS.AUTH_SEND_PASSWORD_RESET_EMAIL,
  ],
  [QUEUES.AUTH_SEND_INVITE_EMAIL, ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL],
] as const;

// durable-verification-email: every work queue goes through one helper, so a
// queue added later retries and parks exactly as the first one does.
describe("assertTopology", () => {
  it.each(WORK_QUEUES)(
    "declares %s with parking, and no single retry queue",
    async (queue, routingKey) => {
      const ch = fakeChannel();
      await assertTopology(ch as unknown as Channel);
      const queues = declared(ch);

      expect(queues[queue]).toEqual({
        durable: true,
        arguments: { "x-dead-letter-exchange": EXCHANGES.PARKING },
      });
      // One queue for every delay held a short wait behind a long one (D-02).
      expect(queues[`${queue}.retry`]).toBeUndefined();
      expect(ch.bindQueue).toHaveBeenCalledWith(
        queue,
        EXCHANGES.JOBS,
        routingKey,
      );
    },
  );

  it("still declares the parking lot", async () => {
    const ch = fakeChannel();
    await assertTopology(ch as unknown as Channel);

    expect(declared(ch)[QUEUES.PARKING]).toEqual({ durable: true });
    expect(ch.bindQueue).toHaveBeenCalledWith(
      QUEUES.PARKING,
      EXCHANGES.PARKING,
      "#",
    );
  });
});

// queue-design-hardening D-02 (audit 2026-09-29, R8): RabbitMQ expires only the
// message at the head of a queue, so one retry queue with an expiry per message held
// a 1 s wait behind a 300 s one. Each delay now waits in a queue of its own.
describe("assertRetryTier", () => {
  it("declares one queue per delay, every message in it waiting the same time", async () => {
    const ch = fakeChannel();
    const queue = QUEUES.AUTH_SEND_INVITE_EMAIL;
    await assertRetryTier(ch as unknown as Channel, queue, 400);

    expect(retryQueueFor(queue, 400)).toBe(`${queue}.retry.400`);
    expect(declared(ch)).toEqual({
      [`${queue}.retry.400`]: {
        durable: true,
        arguments: {
          "x-message-ttl": 400,
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": queue,
        },
      },
    });
    expect(ch.bindQueue).not.toHaveBeenCalled();
  });
});
