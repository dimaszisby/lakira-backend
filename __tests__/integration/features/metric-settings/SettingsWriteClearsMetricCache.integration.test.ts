import { env } from "@/config/envManager.js";
import { redisClient } from "@/utils/redis-client.js";
import { buildWiredFeatures } from "@/composition/features.js";
import { metricEntryKey } from "@/features/metric/application/cache.constants.js";
import {
  TEST_ORG_ID,
  createMetricRow,
  createMetricSettingsRow,
  createUserRow,
} from "../../helpers/db-fixtures.js";

/**
 * Issue #314. The metric list carries each metric's goal type, and a metric's detail can
 * include its settings, but a settings write cleared only the settings caches: the list kept
 * the old goal type until its TTL. `cacheMiddleware` is off under NODE_ENV=test, so this
 * drives the wired use case against a live Redis when the run opts in, as #251's suite does.
 * Built through buildWiredFeatures, so it also proves the composition hands the port in.
 */
const describeRedis = env.ENABLE_REDIS_INTEGRATION ? describe : describe.skip;

describeRedis(
  "a settings write clears its metric's cached list and entry (#314)",
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
      const settings = await createMetricSettingsRow({ metricId: metric.id });

      const listPage = `cursor:metrics:v4:${user.id}:org:${TEST_ORG_ID}:l:20:s:-createdAt:q:_:fn:_:fc:_:after:_:it:0`;
      const entry = metricEntryKey(
        TEST_ORG_ID,
        user.id,
        metric.id,
        "settings",
        20,
      );
      const otherEntry = metricEntryKey(
        TEST_ORG_ID,
        user.id,
        other.id,
        "settings",
        20,
      );
      for (const key of [listPage, entry, otherEntry]) {
        await redisClient.set(key, "{}");
      }

      await buildWiredFeatures().metricSettings.updateSettings.execute(
        user.id,
        TEST_ORG_ID,
        settings.id,
        { goalEnabled: true, goalType: "cumulative", goalValue: 10 },
      );

      expect(await redisClient.exists(listPage)).toBe(0);
      expect(await redisClient.exists(entry)).toBe(0);
      expect(await redisClient.exists(otherEntry)).toBe(1);
    });
  },
);
