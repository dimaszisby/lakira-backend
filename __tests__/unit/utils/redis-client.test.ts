import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  disconnectRedis,
  invalidateCache,
  invalidateCacheByPattern,
} from "@/utils/redis-client.js";
import { cacheEntryName } from "@/utils/cache-entry-name.js";

type AsyncFn<T = void, Args extends any[] = any[]> = (
  ...args: Args
) => Promise<T>;
type AsyncMock<T = void, Args extends any[] = any[]> = jest.MockedFunction<
  AsyncFn<T, Args>
>;
type MockRedisClient = {
  isOpen: boolean;
  on: jest.Mock;
  connect: AsyncMock<void, []>;
  quit: AsyncMock<void, []>;
  del: AsyncMock<void, [string | string[]]>;
  scan: AsyncMock<{ cursor: number; keys: string[] }, [number, unknown]>;
};

// Swap the real redis client with an in-memory mock so we control connection state + cursor responses.
jest.mock("redis", () => {
  const mockRedisClient: MockRedisClient = {
    isOpen: false,
    on: jest.fn(),
    connect: jest.fn() as AsyncMock<void, []>,
    quit: jest.fn() as AsyncMock<void, []>,
    del: jest.fn() as AsyncMock<void, [string | string[]]>,
    scan: jest.fn() as AsyncMock<
      { cursor: number; keys: string[] },
      [number, unknown]
    >,
  };

  mockRedisClient.connect.mockResolvedValue(undefined);
  mockRedisClient.quit.mockResolvedValue(undefined);
  mockRedisClient.del.mockResolvedValue(undefined);
  mockRedisClient.scan.mockResolvedValue({
    cursor: 0,
    keys: [] as string[],
  });

  const captured: { config?: { socket?: { reconnectStrategy?: unknown } } } =
    {};

  return {
    createClient: (config: { socket?: { reconnectStrategy?: unknown } }) => {
      captured.config = config;
      return mockRedisClient;
    },
    __mockClient: mockRedisClient,
    __captured: captured,
  };
});

const { __mockClient: mockRedisClient } = jest.requireMock("redis") as {
  __mockClient: MockRedisClient;
};

jest.mock("@/config/envManager.js", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: undefined,
    REDIS_REQUIRED: false,
    ENABLE_REDIS_INTEGRATION: false,
  },
}));

const { env: envMock } = jest.requireMock("@/config/envManager.js") as {
  env: {
    NODE_ENV: string;
    REDIS_HOST: string;
    REDIS_PORT: string;
    REDIS_PASSWORD?: string;
    REDIS_REQUIRED: boolean;
    ENABLE_REDIS_INTEGRATION: boolean;
  };
};

// Silence logger output during tests and let assertions capture the payloads instead.
// Exposed as both a default export and top-level props: redis-client imports
// `logger, { flushLogs }`, while these tests read `loggerMock.info` directly.
jest.mock("@/utils/logger.js", () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return {
    __esModule: true,
    default: log,
    ...log,
    flushLogs: jest.fn(async () => undefined),
  };
});

const loggerMock = jest.requireMock("@/utils/logger.js") as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  flushLogs: jest.Mock;
};

describe("redis-client utils", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.isOpen = true;
    mockRedisClient.scan.mockResolvedValue({
      cursor: 0,
      keys: [] as string[],
    });
  });

  describe("invalidateCache", () => {
    it("skips deletion when redis is closed", async () => {
      mockRedisClient.isOpen = false;

      await invalidateCache("metrics:user-1");

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it("deletes cache keys and logs when redis is open", async () => {
      await invalidateCache("metrics:user-1");

      expect(mockRedisClient.del).toHaveBeenCalledWith("metrics:user-1");
      expect(loggerMock.info).toHaveBeenCalledWith(
        `[CACHE] invalidated ${cacheEntryName("metrics:user-1")}`,
      );
    });
  });

  describe("invalidateCacheByPattern", () => {
    it("skips scanning when redis is closed", async () => {
      mockRedisClient.isOpen = false;

      await invalidateCacheByPattern("metrics:user-1:*");

      expect(mockRedisClient.scan).not.toHaveBeenCalled();
    });

    it("scans through keys and deletes matches", async () => {
      mockRedisClient.scan
        .mockResolvedValueOnce({ cursor: 1, keys: ["k1", "k2"] })
        .mockResolvedValueOnce({ cursor: 0, keys: [] as string[] });

      await invalidateCacheByPattern("metrics:user-1:*");

      expect(mockRedisClient.scan).toHaveBeenNthCalledWith(1, 0, {
        MATCH: "metrics:user-1:*",
        COUNT: 100,
      });
      expect(mockRedisClient.scan).toHaveBeenNthCalledWith(2, 1, {
        MATCH: "metrics:user-1:*",
        COUNT: 100,
      });
      expect(mockRedisClient.del).toHaveBeenCalledWith(["k1", "k2"]);
      const name = cacheEntryName("metrics:user-1:*");
      expect(loggerMock.info).toHaveBeenCalledWith(
        `[CACHE] invalidated 2 entries matching ${name}`,
      );
      expect(loggerMock.info).toHaveBeenCalledWith(
        `[CACHE] no entries matching ${name}`,
      );
    });

    // Kit log-redaction-coverage, D-08. A cursor key holds the user's search
    // text, and the deleted keys used to be handed to the logger as a list.
    it("logs how many keys it deleted, never the keys or the pattern", async () => {
      const key = "cursor:metrics:v3:user-1:org:org-1:q:victim@example.com";
      const pattern = "cursor:metrics:v*:user-1:org:org-1:*";
      mockRedisClient.scan.mockResolvedValueOnce({ cursor: 0, keys: [key] });

      await invalidateCacheByPattern(pattern);
      await invalidateCache(key);

      expect(mockRedisClient.del).toHaveBeenCalledWith([key]);
      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
      expect(loggerMock.info).toHaveBeenCalledTimes(2);
      for (const call of loggerMock.info.mock.calls) {
        expect(call).toHaveLength(1);
        expect(call[0]).not.toContain("victim@example.com");
        expect(call[0]).not.toContain("user-1");
      }
    });
  });

  describe("disconnectRedis", () => {
    it("logs and skips quit when redis already closed", async () => {
      mockRedisClient.isOpen = false;

      await disconnectRedis();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "[PROCESS] Redis client already closed.",
      );
    });

    it("quits connection when redis is open", async () => {
      mockRedisClient.isOpen = true;

      await disconnectRedis();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        "[PROCESS] Redis client disconnected.",
      );
    });
  });
});

/**
 * The reconnect defect: the error handler used to process.exit(1) on the FIRST error
 * event, so the reconnect strategy could never run a single retry — node-redis emits
 * `error` on every failed attempt, including the first.
 *
 * These load a fresh copy of the module per case, because `isTestEnv` and the
 * exhausted-flag are module-level state captured at import.
 */
describe("redis reconnect + exit behaviour", () => {
  type LoadedClient = {
    reconnectStrategy: (retries: number) => number | Error;
    errorHandler: (err: Error) => void;
    connectHandler: () => void;
  };

  const loadClient = (envOverrides: Record<string, unknown>): LoadedClient => {
    let loaded!: LoadedClient;

    jest.isolateModules(() => {
      const envModule = jest.requireMock("@/config/envManager.js") as {
        env: Record<string, unknown>;
      };
      Object.assign(envModule.env, envOverrides);

      const redisMock = jest.requireMock("redis") as {
        __mockClient: { on: jest.Mock };
        __captured: {
          config?: {
            socket?: { reconnectStrategy?: (r: number) => number | Error };
          };
        };
      };
      redisMock.__mockClient.on.mockClear();

      // Importing registers the handlers and hands the config to createClient.
      require("@/utils/redis-client.js");

      const calls = redisMock.__mockClient.on.mock.calls as [
        string,
        (...a: never[]) => void,
      ][];
      const byEvent = new Map(
        calls.map(([event, handler]) => [event, handler]),
      );

      loaded = {
        reconnectStrategy:
          redisMock.__captured.config!.socket!.reconnectStrategy!,
        errorHandler: byEvent.get("error") as (err: Error) => void,
        connectHandler: byEvent.get("connect") as () => void,
      };
    });

    return loaded;
  };

  const PRODUCTION = { NODE_ENV: "production", REDIS_REQUIRED: true };
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    jest.clearAllMocks();
    exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    // Restore the shared env mock for the suites above.
    const envModule = jest.requireMock("@/config/envManager.js") as {
      env: Record<string, unknown>;
    };
    Object.assign(envModule.env, { NODE_ENV: "test", REDIS_REQUIRED: false });
  });

  it("schedules another attempt while the retry budget remains", () => {
    const { reconnectStrategy } = loadClient(PRODUCTION);

    expect(reconnectStrategy(0)).toBe(0);
    expect(reconnectStrategy(5)).toBe(250);
    // The 2000ms cap is only reached at attempt 40, beyond the 35-attempt budget,
    // so the largest delay actually used is 34 * 50 = 1700ms.
    expect(reconnectStrategy(34)).toBe(1700);
  });

  it("returns an Error once the retry budget is exhausted", () => {
    const { reconnectStrategy } = loadClient(PRODUCTION);

    const result = reconnectStrategy(35);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/unreachable after 35 attempts/);
  });

  it("does NOT exit on a transient error — the whole point of the fix", async () => {
    const { errorHandler } = loadClient(PRODUCTION);

    errorHandler(new Error("ECONNREFUSED"));
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("exits 1 once retries are exhausted and Redis is required", async () => {
    const { reconnectStrategy, errorHandler } = loadClient(PRODUCTION);

    reconnectStrategy(35); // exhaust the budget
    errorHandler(new Error("ECONNREFUSED"));
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerMock.flushLogs).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("continues without Redis when exhausted but Redis is not required", async () => {
    const { reconnectStrategy, errorHandler } = loadClient({
      NODE_ENV: "production",
      REDIS_REQUIRED: false,
    });

    reconnectStrategy(35);
    errorHandler(new Error("ECONNREFUSED"));
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("continuing without Redis"),
    );
  });

  it("never exits in the test environment, whatever the flags", async () => {
    const { reconnectStrategy, errorHandler } = loadClient({
      NODE_ENV: "test",
      REDIS_REQUIRED: true,
    });

    reconnectStrategy(35);
    errorHandler(new Error("ECONNREFUSED"));
    await Promise.resolve();

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("a successful connect restores the retry budget for a later outage", () => {
    const { reconnectStrategy, connectHandler } = loadClient(PRODUCTION);

    expect(reconnectStrategy(35)).toBeInstanceOf(Error);
    connectHandler();
    // budget reset — a fresh outage gets the full window again
    expect(reconnectStrategy(5)).toBe(250);
  });
});
