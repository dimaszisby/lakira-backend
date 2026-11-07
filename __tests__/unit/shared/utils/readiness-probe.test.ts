import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { createReadinessProbe } from "@/shared/utils/readiness-probe.js";

// Kit production-readiness, D-03. The probe sits ahead of the rate limiter, and each
// call used to cost a database check and a Redis ping (audit-2026-10-03 S9).
const WINDOW = 2000;
const TIMEOUT = 2000;

type Check = jest.Mock<() => Promise<unknown>>;

const build = (db: Check, redis: Check) => {
  let clock = 1_000_000;
  const probe = createReadinessProbe({
    checks: { db, redis },
    timeoutMs: TIMEOUT,
    windowMs: WINDOW,
    now: () => clock,
  });
  return {
    probe,
    advance: (ms: number) => {
      clock += ms;
    },
  };
};

const ok = (): Check => jest.fn(() => Promise.resolve("up"));

/** A check the test settles by hand. */
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const check: Check = jest.fn(
    () =>
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  return { check, resolve: () => resolve(), reject: () => reject(new Error()) };
};

afterEach(() => {
  jest.useRealTimers();
});

describe("createReadinessProbe", () => {
  it("reports each check, and ok only when all pass", async () => {
    const db = ok();
    const redis: Check = jest.fn(() => Promise.reject(new Error("down")));
    const { probe } = build(db, redis);

    await expect(probe()).resolves.toEqual({
      ok: false,
      checks: { db: "ok", redis: "fail" },
    });
  });

  it("runs each check once for any number of calls inside the window", async () => {
    const db = ok();
    const redis = ok();
    const { probe, advance } = build(db, redis);

    const first = await probe();
    advance(WINDOW - 1);
    for (let i = 0; i < 50; i += 1) {
      await expect(probe()).resolves.toEqual(first);
    }

    expect(db).toHaveBeenCalledTimes(1);
    expect(redis).toHaveBeenCalledTimes(1);
  });

  it("shares one running check between callers that arrive together", async () => {
    const db = deferred();
    const redis = ok();
    const { probe } = build(db.check, redis);

    const calls = Array.from({ length: 50 }, () => probe());
    // The checks start a tick later; by then all fifty callers are waiting.
    await Promise.resolve();
    expect(db.check).toHaveBeenCalledTimes(1);
    db.resolve();

    const results = await Promise.all(calls);
    expect(db.check).toHaveBeenCalledTimes(1);
    expect(redis).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("checks again once the window has passed", async () => {
    const db = ok();
    const { probe, advance } = build(db, ok());

    await probe();
    advance(WINDOW);
    await probe();

    expect(db).toHaveBeenCalledTimes(2);
  });

  it("holds a failure for the window, then lets a recovery replace it", async () => {
    const db: Check = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue("up");
    const { probe, advance } = build(db, ok());

    expect((await probe()).checks.db).toBe("fail");
    advance(WINDOW - 1);
    expect((await probe()).checks.db).toBe("fail");
    expect(db).toHaveBeenCalledTimes(1);

    advance(1);
    expect(await probe()).toEqual({
      ok: true,
      checks: { db: "ok", redis: "ok" },
    });
    expect(db).toHaveBeenCalledTimes(2);
  });

  it("reports a check that throws before returning a promise as fail", async () => {
    const db: Check = jest.fn(() => {
      throw new Error("not connected");
    });
    const { probe } = build(db, ok());

    await expect(probe()).resolves.toEqual({
      ok: false,
      checks: { db: "fail", redis: "ok" },
    });
  });

  it("cuts off a check that never settles, and does not start it again while it hangs", async () => {
    jest.useFakeTimers();
    const db = deferred();
    const redis = ok();
    const { probe, advance } = build(db.check, redis);

    const pending = probe();
    await jest.advanceTimersByTimeAsync(TIMEOUT);
    await expect(pending).resolves.toEqual({
      ok: false,
      checks: { db: "fail", redis: "ok" },
    });

    // Past the window, the hung check is still out: report fail, start nothing.
    advance(WINDOW);
    await expect(probe()).resolves.toEqual({
      ok: false,
      checks: { db: "fail", redis: "ok" },
    });
    expect(db.check).toHaveBeenCalledTimes(1);
    expect(redis).toHaveBeenCalledTimes(2);

    // Once it settles, the next window checks it again.
    db.resolve();
    await jest.advanceTimersByTimeAsync(0);
    advance(WINDOW);
    const next = probe();
    await jest.advanceTimersByTimeAsync(0);
    expect(db.check).toHaveBeenCalledTimes(2);
    db.resolve();
    await expect(next).resolves.toEqual({
      ok: true,
      checks: { db: "ok", redis: "ok" },
    });
  });

  it("checks again when the clock has moved backwards", async () => {
    const db = ok();
    const { probe, advance } = build(db, ok());

    await probe();
    advance(-60_000);
    await probe();

    expect(db).toHaveBeenCalledTimes(2);
  });
});
