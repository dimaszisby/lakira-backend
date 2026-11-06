/**
 * Measures what one metric-log write's cache invalidation costs, and what it
 * costs the rate limiters that share its Redis client (issue #240).
 *
 * `invalidateCacheByPattern` walks the keyspace with SCAN, and SCAN steps
 * through every key whatever MATCH says, so the walk grows with all tenants'
 * keys, not the matching ones. This seeds keyspaces of several sizes, runs the
 * real `MetricLogCacheRedis.invalidate` on the real client, and times a
 * limiter's `increment` through a `RedisStore` built as `maybeCreateStore`
 * builds it, alone and while the invalidation runs. It also reports the time
 * Redis itself spent on the walks: Redis runs commands one at a time for every
 * tenant and instance, so that time is everyone's.
 *
 * Run against a throwaway Redis that is empty: it refuses a keyspace that is
 * not, and it flushes what it seeded when it ends.
 *
 *   NODE_ENV=development npx tsx scripts/measure-redis-pattern-delete.ts
 */
import { randomUUID } from "node:crypto";
import RedisStore from "rate-limit-redis";
import type { Options as RateLimitOptions } from "express-rate-limit";
import { env } from "@/config/envManager.js";
import { redisClient, disconnectRedis } from "@/utils/redis-client.js";
import { MetricLogCacheRedis } from "@/features/public/metric-log/infrastructure/cache/MetricLogCacheRedis.js";
import { AnalyticsVisualizationInvalidationAdapter } from "@/features/public/analytics/infrastructure/cache/VisualizationInvalidationAdapter.js";
import {
  METRIC_LOG_CURSOR_FEATURE,
  METRIC_LOG_CURSOR_VERSION,
} from "@/features/public/metric-log/application/cache.constants.js";
import { cursorCacheNamespace } from "@/shared/cache/keys.js";

const KEYSPACE_SIZES = [1_000, 10_000, 100_000];
const RUNS_PER_SIZE = 5;
// Fixed before the first run (the plan of #240): at 100k keys, it matters if a
// write's invalidation adds more than 100 ms, or the limiter's p99 rises by more
// than 5 ms during one. The write is judged by the time it took here, with the
// round trip this Redis measures printed alongside.
const THRESHOLD_WRITE_MS = 100;
const THRESHOLD_LIMITER_P99_MS = 5;

const ORG = randomUUID();
const USER = randomUUID();
const METRIC = randomUUID();
const LOG = randomUUID();
const LOG_NAMESPACE = cursorCacheNamespace(
  METRIC_LOG_CURSOR_FEATURE,
  METRIC_LOG_CURSOR_VERSION,
);

/** One tenant's keys, in the shapes the app writes (`cache-keys.ts` of each feature). */
const tenantKeys = (org: string, user: string, metric: string, log: string) => {
  const keys: string[] = [];
  for (let page = 0; page < 40; page++) {
    keys.push(
      `${LOG_NAMESPACE}:${user}:org:${org}:l:20:s:desc:q:_:fm:${metric}:fn:_:after:p${page}:it:0`,
      `${LOG_NAMESPACE}:${user}:org:${org}:l:20:s:desc:q:_:fm:_:fn:_:after:p${page}:it:0`,
    );
  }
  for (let range = 0; range < 10; range++) {
    keys.push(
      `logStats:${org}:${user}:m:${metric}:s:${range}:e:${range + 1}`,
      `logStats:${org}:${user}:m:all:s:${range}:e:${range + 1}`,
      `viz:${org}:${user}:${metric}:b${range}:h`,
      `vizdash:${org}:${user}:b${range}:h`,
      `metric:${org}:${user}:${metric}:inc:none:ll:${range}`,
    );
  }
  keys.push(`log:${org}:${user}:${log}:m:${metric}`);
  return keys;
};

const TARGET_KEYS = tenantKeys(ORG, USER, METRIC, LOG);
// A log write does not delete the `metric:` entries, so they stay seeded but
// unchecked.
const DELETED_KEYS = TARGET_KEYS.filter((key) => !key.startsWith("metric:"));

const setAll = async (keys: string[]) => {
  for (let i = 0; i < keys.length; i += 1_000) {
    const chunk = keys.slice(i, i + 1_000);
    await redisClient.mSet(chunk.map((key) => [key, "x"] as [string, string]));
  }
};

/** Other tenants' keys and limiter counters, up to `size` keys in all. */
const seedFiller = async (size: number) => {
  const filler: string[] = [];
  while (filler.length + TARGET_KEYS.length < size) {
    if (filler.length % 10 === 0) {
      filler.push(`rl:global:10.0.${filler.length % 256}.${filler.length}`);
      continue;
    }
    filler.push(
      ...tenantKeys(randomUUID(), randomUUID(), randomUUID(), randomUUID()),
    );
  }
  await setAll(filler.slice(0, size - TARGET_KEYS.length));
};

/** Server-side counts: the commands sent, and Redis's own time on them. */
const commandStats = async () => {
  const info = await redisClient.info("commandstats");
  const field = (name: string, key: "calls" | "usec") =>
    Number(new RegExp(`cmdstat_${name}:.*?${key}=(\\d+)`).exec(info)?.[1] ?? 0);
  return {
    commands: field("scan", "calls") + field("del", "calls"),
    serverUsec: field("scan", "usec") + field("del", "usec"),
  };
};

/** The median PING, so a reader knows what a round trip cost on this run. */
const roundTripMs = async () => {
  const samples: number[] = [];
  for (let i = 0; i < 200; i++) {
    const start = performance.now();
    await redisClient.ping();
    samples.push(performance.now() - start);
  }
  return median(samples);
};

const percentile = (sorted: number[], p: number) =>
  sorted.length === 0
    ? 0
    : sorted[
        Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
      ];

const median = (values: number[]) =>
  percentile(
    [...values].sort((a, b) => a - b),
    50,
  );

const createLimiterStore = () => {
  const store = new RedisStore({
    prefix: "rl:measure:",
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  });
  store.init({ windowMs: 60_000 } as RateLimitOptions);
  return store;
};

/** Back-to-back limiter increments until `until` resolves; each one's latency. */
const timeLimiter = async (store: RedisStore, until: Promise<unknown>) => {
  let done = false;
  void until.finally(() => {
    done = true;
  });
  const samples: number[] = [];
  while (!done) {
    const start = performance.now();
    await store.increment("203.0.113.7");
    samples.push(performance.now() - start);
  }
  return samples.sort((a, b) => a - b);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const measureSize = async (size: number) => {
  await redisClient.flushDb();
  await seedFiller(size);

  const cache = new MetricLogCacheRedis(
    new AnalyticsVisualizationInvalidationAdapter(),
  );
  const store = createLimiterStore();
  const durations: number[] = [];
  const commands: number[] = [];
  const serverMs: number[] = [];
  const baseline: number[] = [];
  const during: number[] = [];

  for (let run = 0; run < RUNS_PER_SIZE; run++) {
    await setAll(TARGET_KEYS);

    const before = await commandStats();
    const start = performance.now();
    const invalidation = cache.invalidate(USER, ORG, METRIC, LOG);
    const duringRun = await timeLimiter(store, invalidation);
    await invalidation;
    const duration = performance.now() - start;
    const after = await commandStats();

    durations.push(duration);
    commands.push(after.commands - before.commands);
    serverMs.push((after.serverUsec - before.serverUsec) / 1000);
    during.push(...duringRun);
    baseline.push(...(await timeLimiter(store, sleep(duration))));

    const left = await redisClient.exists(DELETED_KEYS);
    if (left !== 0) {
      throw new Error(`${left} of the tenant's keys survived the invalidation`);
    }
  }

  baseline.sort((a, b) => a - b);
  during.sort((a, b) => a - b);
  return {
    size: await redisClient.dbSize(),
    commands: median(commands),
    serverMs: median(serverMs),
    durationMs: median(durations),
    limiter: {
      baselineP50: percentile(baseline, 50),
      baselineP99: percentile(baseline, 99),
      duringP50: percentile(during, 50),
      duringP99: percentile(during, 99),
      duringSamples: during.length,
    },
  };
};

const ms = (value: number) => value.toFixed(2);

const main = async () => {
  if (env.NODE_ENV === "production" || env.NODE_ENV === "staging") {
    throw new Error("Refusing to run with NODE_ENV production or staging.");
  }
  while (!redisClient.isReady) await sleep(50);
  if ((await redisClient.dbSize()) !== 0) {
    throw new Error(
      "Refusing to run: this Redis holds keys. Point REDIS_* at an empty, throwaway Redis.",
    );
  }

  const rtt = await roundTripMs();
  const results = [];
  for (const size of KEYSPACE_SIZES) {
    results.push(await measureSize(size));
  }
  await redisClient.flushDb();

  console.log(
    `\nOne metric-log write's invalidation (median of ${RUNS_PER_SIZE} runs); a round trip here took ${ms(rtt)} ms`,
  );
  console.table(
    results.map((r) => ({
      keys: r.size,
      commands: r.commands,
      "write waited ms": ms(r.durationMs),
      "Redis busy ms": ms(r.serverMs),
    })),
  );

  console.log("\nA limiter's increment on the same client, ms");
  console.table(
    results.map((r) => ({
      keys: r.size,
      "alone p50": ms(r.limiter.baselineP50),
      "alone p99": ms(r.limiter.baselineP99),
      "during p50": ms(r.limiter.duringP50),
      "during p99": ms(r.limiter.duringP99),
      "samples during": r.limiter.duringSamples,
    })),
  );

  const largest = results[results.length - 1];
  const projectedWrite = largest.durationMs;
  const p99Rise = largest.limiter.duringP99 - largest.limiter.baselineP99;
  console.log(
    `\nThreshold at ${largest.size} keys:` +
      `\n  write's invalidation ${ms(projectedWrite)} ms (matters above ${THRESHOLD_WRITE_MS})` +
      `\n  limiter p99 rise ${ms(p99Rise)} ms (matters above ${THRESHOLD_LIMITER_P99_MS})` +
      `\n  => ${
        projectedWrite > THRESHOLD_WRITE_MS ||
        p99Rise > THRESHOLD_LIMITER_P99_MS
          ? "MATTERS"
          : "under the threshold"
      }`,
  );
};

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectRedis());
