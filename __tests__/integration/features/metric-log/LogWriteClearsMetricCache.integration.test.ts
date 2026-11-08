import { env } from "@/config/envManager.js";
import { redisClient } from "@/utils/redis-client.js";
import { buildWiredMetricLogFeature } from "@/composition/metric-log.js";
import { metricEntryKey } from "@/features/metric/application/cache.constants.js";
import {
  TEST_ORG_ID,
  createMetricRow,
  createUserRow,
} from "../../helpers/db-fixtures.js";

/**
 * Issue #251. `GET /metrics` and `GET /metrics/:id` are cached for 60 s, and a
 * log write cleared neither, so both served the metric's old logs and count.
 * `cacheMiddleware` is off under NODE_ENV=test, so an HTTP list, post, list
 * never sees the cache. This drives the wired use case against a live Redis
 * instead, when the run opts in, as the other Redis suites do.
 */
const describeRedis = env.ENABLE_REDIS_INTEGRATION ? describe : describe.skip;

describeRedis(
  "a log write clears its metric's cached list and entry (#251)",
  () => {
    beforeAll(async () => {
      if (!redisClient.isOpen) await redisClient.connect();
    });
    beforeEach(async () => {
      await redisClient.flushDb();
    });
    afterAll(async () => {
      await redisClient.flushDb();
    });

    it("deletes the list pages and the metric's entries, and keeps another metric's", async () => {
      const user = await createUserRow();
      const metric = await createMetricRow({ userId: user.id, name: "Weight" });
      const other = await createMetricRow({ userId: user.id, name: "Steps" });

      const listPage = `cursor:metrics:v4:${user.id}:org:${TEST_ORG_ID}:l:20:s:-createdAt:q:_:fn:_:fc:_:after:_:it:0`;
      const entry = metricEntryKey(TEST_ORG_ID, user.id, metric.id, "logs", 20);
      const otherEntry = metricEntryKey(
        TEST_ORG_ID,
        user.id,
        other.id,
        "logs",
        20,
      );
      for (const key of [listPage, entry, otherEntry]) {
        await redisClient.set(key, "{}");
      }

      await buildWiredMetricLogFeature().createLog.execute({
        userId: user.id,
        organizationId: TEST_ORG_ID,
        metricId: metric.id,
        logValue: 1,
        type: "manual",
      });

      expect(await redisClient.exists(listPage)).toBe(0);
      expect(await redisClient.exists(entry)).toBe(0);
      expect(await redisClient.exists(otherEntry)).toBe(1);
    });
  },
);
