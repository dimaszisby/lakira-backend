import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import type { AuthRequest } from "@/types/request.context.js";
import type { Response } from "express";
import {
  createGlobalRateLimiter,
  createUserRateLimiter,
  createAnalyticsRateLimiter,
  createEmailVerificationEmailRateLimiter,
  createEmailVerificationIpRateLimiter,
  createRegisterIpRateLimiter,
} from "@/shared/middleware/rate-limiter.js";

// Replace the real middleware factories with simple stubs so we can assert on the config that's passed in.
jest.mock("express-rate-limit", () => {
  const factory = jest.fn((options) => options);
  return {
    __esModule: true,
    default: factory,
  };
});

const { default: rateLimitFactory } = jest.requireMock(
  "express-rate-limit",
) as { default: jest.Mock };

jest.mock("rate-limit-redis", () => {
  const storeFactory = jest.fn((options) => ({ storeOptions: options }));
  return {
    __esModule: true,
    default: storeFactory,
  };
});

const { default: redisStoreFactory } = jest.requireMock("rate-limit-redis") as {
  default: jest.Mock;
};

jest.mock("@/config/envManager.js", () => ({
  env: {
    NODE_ENV: "development",
    REDIS_REQUIRED: false,
    RATE_LIMIT_GLOBAL_MAX: 100,
    RATE_LIMIT_USER_MAX: 50,
    RATE_LIMIT_ANALYTICS_MAX: 25,
    RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX: 3,
    RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX: 10,
    RATE_LIMIT_REGISTER_IP_MAX: 7,
    DISABLE_RATE_LIMITING: false,
  },
}));

const { env: envMock } = jest.requireMock("@/config/envManager.js") as {
  env: {
    NODE_ENV: string;
    REDIS_REQUIRED: boolean;
    RATE_LIMIT_GLOBAL_MAX: number;
    RATE_LIMIT_USER_MAX: number;
    RATE_LIMIT_ANALYTICS_MAX: number;
    RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX: number;
    RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX: number;
    RATE_LIMIT_REGISTER_IP_MAX: number;
    DISABLE_RATE_LIMITING: boolean;
  };
};

// The limiter logs warnings when it downgrades behavior; spy on logger so the tests stay noise-free.
jest.mock("@/utils/logger.js", () => ({
  warn: jest.fn(),
  info: jest.fn(),
}));

const loggerMock = jest.requireMock("@/utils/logger.js") as {
  warn: jest.Mock;
  info: jest.Mock;
};

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    isOpen: false,
    sendCommand: jest.fn(),
  },
}));

const { redisClient } = jest.requireMock("@/utils/redis-client.js") as {
  redisClient: {
    isOpen: boolean;
    sendCommand: jest.Mock;
  };
};

const createResponse = (): Response => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res as unknown as Response;
};

// Limiter factory returns the options object (per the mock), so unwrap it for convenience.
const unwrapLimiter = (limiter: unknown) => limiter as any;

describe("rate limiter middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    envMock.NODE_ENV = "development";
    envMock.REDIS_REQUIRED = false;
    envMock.DISABLE_RATE_LIMITING = false;
    redisClient.isOpen = false;
  });

  it("falls back to in-memory store when Redis is unavailable and optional", () => {
    const limiter = unwrapLimiter(createGlobalRateLimiter());

    expect(rateLimitFactory).toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "[RATE LIMITER] Redis not connected; falling back to in-memory store.",
    );
    expect(limiter.store).toBeUndefined();
    expect(limiter.max).toBe(envMock.RATE_LIMIT_GLOBAL_MAX);
  });

  it("creates a Redis-backed store when client is open", () => {
    redisClient.isOpen = true;

    const limiter = unwrapLimiter(createGlobalRateLimiter());

    expect(redisStoreFactory).toHaveBeenCalledTimes(1);
    expect(limiter.store).toEqual(
      expect.objectContaining({
        storeOptions: expect.objectContaining({
          sendCommand: expect.any(Function),
        }),
      }),
    );

    const commandArgs = ["INCR", "key"];
    limiter.store.storeOptions.sendCommand(...commandArgs);
    expect(redisClient.sendCommand).toHaveBeenCalledWith(commandArgs);
  });

  it("logs offender identity for user rate limiter", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createUserRateLimiter());

    const userReq = { user: { id: "user-7" } } as AuthRequest;
    const anonymousReq = { ip: "127.0.0.1" } as AuthRequest;
    const res = createResponse();

    expect(limiter.keyGenerator(userReq)).toBe("user:user-7");
    expect(limiter.keyGenerator(anonymousReq)).toBe("127.0.0.1");

    const options = { statusCode: 429, message: "Slow down." };
    limiter.handler(userReq, res, jest.fn(), options);
    limiter.handler(anonymousReq, res, jest.fn(), options);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Rate limit exceeded for User ID: user-7",
    );
    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Rate limit exceeded for IP: 127.0.0.1",
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: limiter.message,
    });
  });

  it("uses analytics-specific key and message", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createAnalyticsRateLimiter());
    const res = createResponse();
    const req = { user: { id: "abc" }, ip: "1.1.1.1" } as AuthRequest;
    const options = {
      statusCode: 429,
      message: "Too many visualization requests, slow down.",
    };

    expect(limiter.keyGenerator(req)).toBe("analytics:abc");

    limiter.handler(req, res, jest.fn(), options);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Analytics rate limit exceeded for abc",
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: limiter.message,
    });
  });

  it("falls back to IP for analytics key when user missing", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createAnalyticsRateLimiter());
    const req = { ip: "9.9.9.9" } as AuthRequest;

    expect(limiter.keyGenerator(req)).toBe("9.9.9.9");
  });

  it("uses per-email key and configured max for email verification email limiter", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createEmailVerificationEmailRateLimiter());
    const res = createResponse();

    const authedReq = {
      user: { email: "test@example.com" },
      ip: "1.2.3.4",
    } as AuthRequest;
    const anonReq = { ip: "1.2.3.4" } as AuthRequest;

    expect(limiter.keyGenerator(authedReq)).toBe(
      "email-verification:email:test@example.com",
    );
    expect(limiter.keyGenerator(anonReq)).toBe("email-verification:ip:1.2.3.4");
    expect(limiter.max).toBe(envMock.RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX);

    const options = {
      statusCode: 429,
      message: "Too many verification email requests, please try again later.",
    };
    limiter.handler(authedReq, res, jest.fn(), options);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Email verification email rate limit hit for test@example.com",
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: limiter.message,
    });
  });

  it("uses per-IP key and configured max for email verification IP limiter", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createEmailVerificationIpRateLimiter());
    const res = createResponse();

    const req = { ip: "5.6.7.8" } as AuthRequest;

    expect(limiter.keyGenerator(req)).toBe("email-verification-ip:5.6.7.8");
    expect(limiter.max).toBe(envMock.RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX);

    const options = {
      statusCode: 429,
      message: "Too many verification email requests, please try again later.",
    };
    limiter.handler(req, res, jest.fn(), options);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Email verification IP rate limit hit for 5.6.7.8",
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: limiter.message,
    });
  });

  // Audit R1 (kit register-rate-limiter, D-01): registration emails the address
  // it is given, so it gets an hourly per-IP budget of its own.
  it("uses per-IP key, hourly window and configured max for the register limiter", () => {
    redisClient.isOpen = true;
    const limiter = unwrapLimiter(createRegisterIpRateLimiter());
    const res = createResponse();
    const req = { ip: "9.9.9.9" } as AuthRequest;

    expect(limiter.keyGenerator(req)).toBe("register-ip:9.9.9.9");
    expect(limiter.max).toBe(envMock.RATE_LIMIT_REGISTER_IP_MAX);
    expect(limiter.windowMs).toBe(60 * 60 * 1000);
    expect(limiter.store).toEqual(
      expect.objectContaining({ storeOptions: expect.anything() }),
    );

    const options = {
      statusCode: 429,
      message: "Too many registration attempts, please try again later.",
    };
    expect(limiter.message).toEqual(options.message);
    limiter.handler(req, res, jest.fn(), options);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Registration IP rate limit hit for 9.9.9.9",
    );
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message: limiter.message,
    });
  });

  it("returns a no-op middleware when DISABLE_RATE_LIMITING is true", () => {
    envMock.DISABLE_RATE_LIMITING = true;

    const globalLimiter = createGlobalRateLimiter();
    const userLimiter = createUserRateLimiter();
    const analyticsLimiter = createAnalyticsRateLimiter();
    const registerLimiter = createRegisterIpRateLimiter();
    const next = jest.fn();
    const res = createResponse();

    globalLimiter({} as AuthRequest, res, next);
    userLimiter({} as AuthRequest, res, next);
    analyticsLimiter({} as AuthRequest, res, next);
    registerLimiter({} as AuthRequest, res, next);

    expect(next).toHaveBeenCalledTimes(4);
    expect(rateLimitFactory).not.toHaveBeenCalled();
    expect(loggerMock.info).toHaveBeenCalledWith(
      "[RATE LIMITER] DISABLE_RATE_LIMITING=true — skipping throttling (contract tests / fuzzing runs).",
    );
  });
});
