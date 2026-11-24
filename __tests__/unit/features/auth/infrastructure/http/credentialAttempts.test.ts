import { jest } from "@jest/globals";
import { credentialAttemptCounter } from "@/features/auth/infrastructure/http/credentialAttempts.js";
import {
  makeAttemptCounter,
  type LockoutRedisClient,
} from "@/features/auth/infrastructure/http/attemptCounter.js";
import {
  LOCKOUT_THRESHOLD,
  LOCKOUT_TTL_SECONDS,
} from "@/features/auth/infrastructure/http/loginLockout.js";
import logger from "@/utils/logger.js";

type MockRedis = jest.Mocked<LockoutRedisClient> & { isOpen: boolean };

const buildRedis = (overrides: Partial<MockRedis> = {}): MockRedis =>
  ({
    isOpen: true,
    get: jest.fn<LockoutRedisClient["get"]>(),
    incr: jest.fn<LockoutRedisClient["incr"]>(),
    expire: jest.fn<LockoutRedisClient["expire"]>(),
    del: jest.fn<LockoutRedisClient["del"]>(),
    ...overrides,
  }) as MockRedis;

const USER_ID = "8f9c2f4e-6a1b-4c3d-9e8f-0a1b2c3d4e5f";

describe("credentialAttemptCounter (credential-changes D-04)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("keys by user id under its own prefix, apart from the login lockout", async () => {
    const redis = buildRedis();
    redis.get.mockResolvedValue(null);

    await credentialAttemptCounter.check(USER_ID, redis);

    expect(redis.get).toHaveBeenCalledWith(
      `auth:credential-attempts:${USER_ID}`,
    );
  });

  it("refuses with 429 and its own message at the login lockout's threshold", async () => {
    const redis = buildRedis();
    redis.get.mockResolvedValue(String(LOCKOUT_THRESHOLD));

    await expect(
      credentialAttemptCounter.check(USER_ID, redis),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: "Too many incorrect passwords. Please try again later.",
    });
  });

  it("starts the window on the first failure and logs the user id, never an address, at the threshold", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const redis = buildRedis();
    redis.incr.mockResolvedValueOnce(1);

    await credentialAttemptCounter.recordFailure(USER_ID, redis);
    expect(redis.expire).toHaveBeenCalledWith(
      `auth:credential-attempts:${USER_ID}`,
      LOCKOUT_TTL_SECONDS,
    );

    redis.incr.mockResolvedValueOnce(LOCKOUT_THRESHOLD);
    await credentialAttemptCounter.recordFailure(USER_ID, redis);
    expect(warn).toHaveBeenCalledWith("auth.credentials.attempts_exceeded", {
      userId: USER_ID,
    });
  });

  it("fails open, logged under its own name, when Redis is down", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const redis = buildRedis();
    redis.get.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      credentialAttemptCounter.check(USER_ID, redis),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "auth.credentials.redis_unavailable",
      expect.objectContaining({ op: "check" }),
    );
  });

  it("passes without touching a closed client", async () => {
    const redis = buildRedis({ isOpen: false });

    await credentialAttemptCounter.check(USER_ID, redis);
    await credentialAttemptCounter.recordFailure(USER_ID, redis);
    await credentialAttemptCounter.reset(USER_ID, redis);

    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
  });

  it("reserve counts each attempt before it is judged, and refuses past the limit (review MEDIUM-1)", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const redis = buildRedis();
    let n = 0;
    redis.incr.mockImplementation(async () => {
      n += 1;
      return n;
    });

    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      await expect(
        credentialAttemptCounter.reserve(USER_ID, redis),
      ).resolves.toBeUndefined();
    }
    await expect(
      credentialAttemptCounter.reserve(USER_ID, redis),
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("auth.credentials.attempts_exceeded", {
      userId: USER_ID,
    });
  });

  it("reserve fails open when Redis is down", async () => {
    jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const redis = buildRedis();
    redis.incr.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      credentialAttemptCounter.reserve(USER_ID, redis),
    ).resolves.toBeUndefined();
  });

  it("reset deletes the user's count", async () => {
    const redis = buildRedis();

    await credentialAttemptCounter.reset(USER_ID, redis);

    expect(redis.del).toHaveBeenCalledWith(
      `auth:credential-attempts:${USER_ID}`,
    );
  });
});

describe("makeAttemptCounter", () => {
  it("uses the threshold, window and names it is given", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const counter = makeAttemptCounter({
      keyOf: (s) => `test:${s}`,
      threshold: 2,
      ttlSeconds: 60,
      message: "slow down",
      events: { triggered: "test.triggered", unavailable: "test.unavailable" },
      meta: (s) => ({ subject: s }),
    });
    const redis = buildRedis();
    redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    await counter.recordFailure("a", redis);
    await counter.recordFailure("a", redis);
    expect(redis.expire).toHaveBeenCalledTimes(1);
    expect(redis.expire).toHaveBeenCalledWith("test:a", 60);
    expect(warn).toHaveBeenCalledWith("test.triggered", { subject: "a" });

    redis.get.mockResolvedValue("2");
    await expect(counter.check("a", redis)).rejects.toMatchObject({
      statusCode: 429,
      message: "slow down",
    });
    warn.mockRestore();
  });
});
