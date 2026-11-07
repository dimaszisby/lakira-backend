export type CheckStatus = "ok" | "fail";

export type ReadinessResult<K extends string> = {
  ok: boolean;
  checks: Record<K, CheckStatus>;
};

export type ReadinessProbeOptions<K extends string> = {
  /** One function per dependency. It passes by resolving and fails by rejecting. */
  checks: Record<K, () => Promise<unknown>>;
  /** How long one check may take before it is reported as failed. */
  timeoutMs: number;
  /** How long a result is served before the checks run again. */
  windowMs: number;
  now?: () => number;
};

/**
 * The readiness probe is unauthenticated and sits ahead of the rate limiter, so what
 * one call costs is what a flood of calls costs. This bounds it: any number of callers
 * get at most one run of the checks per window, never two at once, and a check that is
 * still hanging from an earlier run is not started again.
 *
 * A failed result is held for the window like a good one. Without that the bound would
 * disappear exactly when a dependency is down (kit production-readiness, D-03).
 */
export const createReadinessProbe = <K extends string>({
  checks,
  timeoutMs,
  windowMs,
  now = () => Date.now(),
}: ReadinessProbeOptions<K>): (() => Promise<ReadinessResult<K>>) => {
  const names = Object.keys(checks) as K[];
  const unsettled = new Set<K>();
  let cached: { at: number; result: ReadinessResult<K> } | undefined;
  let running: Promise<ReadinessResult<K>> | undefined;

  const runOne = (name: K): Promise<CheckStatus> => {
    if (unsettled.has(name)) return Promise.resolve("fail");

    unsettled.add(name);
    // Inside `then`, so a check that throws before returning a promise is a rejection.
    const check = Promise.resolve()
      .then(() => checks[name]())
      .finally(() => unsettled.delete(name));

    return new Promise<CheckStatus>((resolve) => {
      const timer = setTimeout(() => resolve("fail"), timeoutMs);
      check
        .then(
          () => resolve("ok"),
          () => resolve("fail"),
        )
        .finally(() => clearTimeout(timer));
    });
  };

  const runAll = async (): Promise<ReadinessResult<K>> => {
    const statuses = await Promise.all(names.map(runOne));
    const result = {
      ok: statuses.every((status) => status === "ok"),
      checks: Object.fromEntries(
        names.map((name, i) => [name, statuses[i]]),
      ) as Record<K, CheckStatus>,
    };
    cached = { at: now(), result };
    return result;
  };

  return () => {
    if (cached) {
      const age = now() - cached.at;
      // A negative age means the clock was set back; do not trust the entry.
      if (age >= 0 && age < windowMs) return Promise.resolve(cached.result);
    }
    running ??= runAll().finally(() => {
      running = undefined;
    });
    return running;
  };
};
