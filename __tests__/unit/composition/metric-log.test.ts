import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { ConsumeMessage } from "amqplib";
import { buildWiredMetricLogFeature } from "@/composition/metric-log.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import type { MetricAccessPort } from "@/features/metric-log/application/ports/MetricAccessPort.js";

/**
 * ADR-0056: the handler the worker runs comes from the same wiring as the HTTP
 * path, so a queued job clears the analytics caches too (audit R5). Redis is off
 * under NODE_ENV=test, so it is replaced here by an in-memory key set.
 */
const store = new Set<string>();

const globToRegExp = (pattern: string) =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    isOpen: true,
    scanIterator: ({ MATCH }: { MATCH: string }) => {
      const matcher = globToRegExp(MATCH);
      const keys = [...store].filter((key) => matcher.test(key));
      return (async function* () {
        for (const key of keys) yield key;
      })();
    },
    del: async (key: string) => {
      store.delete(key);
    },
  },
  invalidateCache: jest.fn(async () => undefined),
  invalidateCacheByPattern: jest.fn(async () => undefined),
}));

const USER = "user-1";
const ORG = "org-1";
const METRIC = "metric-1";

const jobMessage = () =>
  ({
    content: Buffer.from(
      JSON.stringify({
        jobId: "job-1",
        userId: USER,
        organizationId: ORG,
        metricId: METRIC,
        count: 3,
      }),
    ),
    properties: { messageId: "message-1" },
  }) as unknown as ConsumeMessage;

const build = (outcome: "processed" | "duplicate" = "processed") => {
  const metricAccess = {
    ensureMetricOwnership: jest.fn(async () => undefined),
  } as unknown as MetricAccessPort;
  const idempotency: MessageIdempotencyPort = {
    runOnce: jest.fn(async () => outcome),
  };
  return buildWiredMetricLogFeature({ metricAccess, idempotency });
};

describe("buildWiredMetricLogFeature", () => {
  beforeEach(() => {
    store.clear();
    store.add(`viz:${ORG}:${USER}:${METRIC}:line:7d`);
    store.add(`vizdash:${ORG}:${USER}:overview`);
    store.add(`viz:${ORG}:${USER}:other-metric:line:7d`);
    store.add(`viz:other-org:${USER}:${METRIC}:line:7d`);
  });

  it("the queue handler clears the analytics caches for the job's metric", async () => {
    const { dummyLogsHandler } = build();

    await dummyLogsHandler.handle(jobMessage(), {
      queue: "metric-log.generate-dummy",
    } as never);

    expect(store.has(`viz:${ORG}:${USER}:${METRIC}:line:7d`)).toBe(false);
    expect(store.has(`vizdash:${ORG}:${USER}:overview`)).toBe(false);
  });

  it("leaves other metrics' and other organizations' caches alone", async () => {
    const { dummyLogsHandler } = build();

    await dummyLogsHandler.handle(jobMessage(), {
      queue: "metric-log.generate-dummy",
    } as never);

    expect(store.has(`viz:${ORG}:${USER}:other-metric:line:7d`)).toBe(true);
    expect(store.has(`viz:other-org:${USER}:${METRIC}:line:7d`)).toBe(true);
  });

  // A delivery that committed and then failed to invalidate is retried, and the
  // retry is a duplicate. It must still clear the caches.
  it("clears the caches on a duplicate delivery too", async () => {
    const { dummyLogsHandler } = build("duplicate");

    await dummyLogsHandler.handle(jobMessage(), {
      queue: "metric-log.generate-dummy",
    } as never);

    expect(store.has(`viz:${ORG}:${USER}:${METRIC}:line:7d`)).toBe(false);
    expect(store.has(`vizdash:${ORG}:${USER}:overview`)).toBe(false);
  });
});
