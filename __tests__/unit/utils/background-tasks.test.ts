import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  drainBackgroundTasks,
  pendingBackgroundTaskCount,
  runInBackground,
} from "@/utils/background-tasks.js";

jest.mock("@/utils/logger.js", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const loggerMock = (
  jest.requireMock("@/utils/logger.js") as {
    default: Record<"info" | "error" | "warn", jest.Mock>;
  }
).default;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};

const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// A macrotask boundary: every promise chain that can run has run by then.
const flushMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

describe("background tasks", () => {
  beforeEach(async () => {
    await drainBackgroundTasks();
    jest.clearAllMocks();
  });

  it("tracks a task until it settles", async () => {
    const work = deferred();
    runInBackground("slow", () => work.promise);

    expect(pendingBackgroundTaskCount()).toBe(1);

    work.resolve();
    await flushMicrotasks();

    expect(pendingBackgroundTaskCount()).toBe(0);
  });

  it("drain resolves only after the pending task settles", async () => {
    const work = deferred();
    runInBackground("slow", () => work.promise);

    let drained = false;
    const drain = drainBackgroundTasks().then((abandoned) => {
      drained = true;
      return abandoned;
    });

    await flushMicrotasks();
    expect(drained).toBe(false);

    work.resolve();
    await expect(drain).resolves.toBe(0);
    expect(drained).toBe(true);
  });

  it("drain also waits for work started while it is draining", async () => {
    const first = deferred();
    const second = deferred();
    runInBackground("first", () => first.promise);

    let drained = false;
    const drain = drainBackgroundTasks().then(() => {
      drained = true;
    });

    runInBackground("second", () => second.promise);
    first.resolve();
    await flushMicrotasks();
    expect(drained).toBe(false);

    second.resolve();
    await drain;
    expect(drained).toBe(true);
  });

  it("drain resolves immediately when nothing is pending", async () => {
    await expect(drainBackgroundTasks()).resolves.toBe(0);
  });

  it("drain gives up after the timeout and names what it abandoned", async () => {
    const stuck = deferred();
    runInBackground("stuck-email", () => stuck.promise);

    await expect(drainBackgroundTasks(20)).resolves.toBe(1);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("abandoning: stuck-email"),
      expect.objectContaining({ pending: ["stuck-email"] }),
    );

    stuck.resolve();
    await drainBackgroundTasks();
  });

  it("logs a rejected task once and does not reject", async () => {
    runInBackground("failing", () => Promise.reject(new Error("smtp down")), {
      userId: "user-1",
    });

    await expect(drainBackgroundTasks()).resolves.toBe(0);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      "[BACKGROUND] Task failed: failing: smtp down",
      expect.objectContaining({
        userId: "user-1",
        error: "smtp down",
        errorName: "Error",
        stack: expect.stringContaining("smtp down"),
      }),
    );
  });

  it("does not reject when the logger itself throws", async () => {
    loggerMock.error.mockImplementationOnce(() => {
      throw new Error("logger down");
    });
    runInBackground("failing", () => Promise.reject(new Error("smtp down")));

    await expect(drainBackgroundTasks()).resolves.toBe(0);
  });

  it("logs a synchronous throw once and does not throw to the caller", async () => {
    expect(() =>
      runInBackground("throwing", () => {
        throw new Error("boom");
      }),
    ).not.toThrow();

    await drainBackgroundTasks();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("throwing"),
      expect.objectContaining({ error: "boom" }),
    );
  });
});
