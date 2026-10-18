import { describe, it, expect, jest } from "@jest/globals";
import type { Channel } from "amqplib";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
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
] as const;

// durable-verification-email: both work queues go through one helper, so a
// queue added later retries and parks exactly as the first one does.
describe("assertTopology", () => {
  it.each(WORK_QUEUES)(
    "declares %s with a retry queue and parking",
    async (queue, routingKey) => {
      const ch = fakeChannel();
      await assertTopology(ch as unknown as Channel);
      const queues = declared(ch);

      expect(queues[queue]).toEqual({
        durable: true,
        arguments: { "x-dead-letter-exchange": EXCHANGES.PARKING },
      });
      expect(queues[retryQueueFor(queue)]).toEqual({
        durable: true,
        arguments: {
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": queue,
        },
      });
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
