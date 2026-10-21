import { describe, it, expect, jest } from "@jest/globals";
import { buildWorkerShutdownSteps } from "@/worker-shutdown.js";
import { WORKER_DRAIN_TIMEOUT_MS } from "@/utils/shutdown.js";

/**
 * Kit queue-failure-paths (audit 2026-10-20): the worker drained for 20 s after a crash, which
 * the server does not (X67, D-04), and never closed the Redis client the auth feature opens
 * (X66).
 */
const build = () => {
  const order: string[] = [];
  const consumer = {
    close: jest.fn(async (drainTimeoutMs?: number) => {
      void drainTimeoutMs;
      order.push("consumers");
    }),
  };
  const deps = {
    consumers: [consumer, consumer],
    retryPublisher: {
      close: jest.fn(async () => {
        order.push("publisher");
      }),
    },
    disconnectRabbitMQ: jest.fn(async () => {
      order.push("rabbitmq");
    }),
    disconnectRedis: jest.fn(async () => {
      order.push("redis");
    }),
    closeDatabase: jest.fn(async () => {
      order.push("database");
    }),
  };
  return { steps: buildWorkerShutdownSteps(() => deps), consumer, deps, order };
};

describe("the worker's shutdown steps", () => {
  it("drains the consumers on a clean stop, then closes everything it opened, Redis included", async () => {
    const { steps, consumer, deps, order } = build();

    await steps(0);

    expect(consumer.close).toHaveBeenCalledWith(WORKER_DRAIN_TIMEOUT_MS);
    expect(deps.disconnectRedis).toHaveBeenCalledTimes(1);
    expect(order).toEqual([
      "consumers",
      "consumers",
      "publisher",
      "rabbitmq",
      "redis",
      "database",
    ]);
  });

  it("closes the consumers without draining after a crash", async () => {
    const { steps, consumer, deps } = build();

    await steps(1);

    expect(consumer.close).toHaveBeenCalledWith(0);
    expect(deps.disconnectRedis).toHaveBeenCalledTimes(1);
    expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
  });
});
