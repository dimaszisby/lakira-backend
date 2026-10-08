import { describe, beforeEach, it, expect, jest } from "@jest/globals";
import express, { type Response } from "express";
import request from "supertest";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { sendError } from "@/shared/utils/error-envelope.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import { cacheEntryName } from "@/utils/cache-entry-name.js";
import type { AuthRequest } from "@/types/request.context.js";

// Stub env + redis + logger so cache middleware behavior can be driven entirely by the test.
jest.mock("@/config/envManager.js", () => ({
  env: { NODE_ENV: "production" },
}));

const { env: envMock } = jest.requireMock("@/config/envManager.js") as {
  env: { NODE_ENV: string };
};

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: {
    get: jest.fn(),
    setEx: jest.fn(),
  },
}));

const { redisClient } = jest.requireMock("@/utils/redis-client.js") as {
  redisClient: {
    get: jest.MockedFunction<(key: string) => Promise<string | null>>;
    setEx: jest.MockedFunction<
      (key: string, ttl: number, payload: string) => Promise<void>
    >;
  };
};

jest.mock("@/utils/logger.js", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

const loggerMock = jest.requireMock("@/utils/logger.js") as Record<
  "info" | "error",
  jest.Mock
>;

type MockResponse = Response & {
  statusCode: number;
  status: jest.Mock;
  json: jest.Mock;
  originalJson: jest.Mock;
};

// Minimal Express response mock that lets us intercept the patched json() method.
const createResponse = (): MockResponse => {
  const res = {
    statusCode: 200,
    status: jest.fn(),
    json: jest.fn(),
    originalJson: jest.fn(),
  } as unknown as MockResponse;
  res.originalJson = res.json;
  res.status.mockImplementation((code) => {
    res.statusCode = code as number;
    return res;
  });
  return res;
};

describe("cacheMiddleware", () => {
  const ttl = 60;
  const authRequest = { user: { id: "user-42" } } as Partial<AuthRequest>;
  const keyGenerator = jest
    .fn<(req: AuthRequest) => string>()
    .mockImplementation((req) => `cache:${req.user?.id}`);
  const createCachingMiddleware = () =>
    cacheMiddleware(keyGenerator, ttl, { disableInTest: false });

  beforeEach(() => {
    jest.clearAllMocks();
    envMock.NODE_ENV = "production";
    redisClient.get.mockResolvedValue(null);
    redisClient.setEx.mockResolvedValue();
  });

  it("short-circuits in test environments", async () => {
    envMock.NODE_ENV = "test";
    const next = jest.fn();
    const res = createResponse();

    await cacheMiddleware(keyGenerator, ttl)(
      authRequest as AuthRequest,
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(redisClient.get).not.toHaveBeenCalled();
  });

  it("responds with cached payload when present", async () => {
    const next = jest.fn();
    const res = createResponse();
    const payload = { hello: "cached" };
    redisClient.get.mockResolvedValueOnce(JSON.stringify(payload));

    await createCachingMiddleware()(authRequest as AuthRequest, res, next);

    expect(redisClient.get).toHaveBeenCalledWith("cache:user-42");
    expect(loggerMock.info).toHaveBeenCalledWith(
      `[CACHE] hit ${cacheEntryName("cache:user-42")}`,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(payload);
    expect(next).not.toHaveBeenCalled();
  });

  it("delegates downstream and stores payload on cache miss", async () => {
    const next = jest.fn();
    const res = createResponse();
    const middleware = createCachingMiddleware();
    const responseBody = { data: "fresh" };

    await middleware(authRequest as AuthRequest, res, next);

    expect(loggerMock.info).toHaveBeenCalledWith(
      `[CACHE] miss ${cacheEntryName("cache:user-42")}`,
    );
    expect(next).toHaveBeenCalledTimes(1);

    await res.json(responseBody);
    await Promise.resolve();

    expect(redisClient.setEx).toHaveBeenCalledWith(
      "cache:user-42",
      ttl,
      JSON.stringify(responseBody),
    );
    expect(res.originalJson).toHaveBeenCalledWith(responseBody);
    expect(loggerMock.info).toHaveBeenCalledWith(
      `[CACHE] stored ${cacheEntryName("cache:user-42")} (TTL: 60s)`,
    );
  });

  it("logs cache write failures but still resolves response", async () => {
    const next = jest.fn();
    const res = createResponse();
    const writeError = new Error("boom");
    redisClient.setEx.mockRejectedValueOnce(writeError);

    await createCachingMiddleware()(authRequest as AuthRequest, res, next);
    await res.json({ data: "value" });
    await drainBackgroundTasks();

    expect(loggerMock.error).toHaveBeenCalledWith(
      "[BACKGROUND] Task failed: cache-write: boom",
      expect.objectContaining({
        cache: cacheEntryName("cache:user-42"),
        error: "boom",
        stack: writeError.stack,
      }),
    );
    expect(res.originalJson).toHaveBeenCalledWith({ data: "value" });
  });

  it("logs and calls next when cache read throws", async () => {
    const next = jest.fn();
    const res = createResponse();
    const readError = new Error("redis down");
    redisClient.get.mockRejectedValueOnce(readError);

    await createCachingMiddleware()(authRequest as AuthRequest, res, next);

    expect(loggerMock.error).toHaveBeenCalledWith(
      "[CACHE ERROR] Cache middleware error:",
      readError,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  // Audit S1 (2026-10-03): the wrapper stored whatever reached res.json, and
  // sendError writes error bodies through the same res.json. A 404 was stored
  // and then replayed as a 200 until the key expired.
  it.each([201, 204, 304, 400, 403, 404, 429, 500, 503])(
    "does not store a %i response",
    async (statusCode) => {
      const res = createResponse();

      await createCachingMiddleware()(
        authRequest as AuthRequest,
        res,
        jest.fn(),
      );
      res.status(statusCode).json({ status: "fail", message: "nope" });
      await drainBackgroundTasks();

      expect(redisClient.setEx).not.toHaveBeenCalled();
      expect(res.originalJson).toHaveBeenCalledWith({
        status: "fail",
        message: "nope",
      });
    },
  );

  describe("through a real Express app", () => {
    const store = new Map<string, string>();
    const buildApp = (handler: express.RequestHandler) => {
      const app = express();
      app.get(
        "/thing",
        cacheMiddleware(() => "cache:thing", ttl),
        handler,
      );
      return app;
    };

    beforeEach(() => {
      store.clear();
      redisClient.get.mockImplementation(async (key) => store.get(key) ?? null);
      redisClient.setEx.mockImplementation(async (key, _ttl, payload) => {
        store.set(key, payload);
      });
    });

    it("answers an error the same way every time", async () => {
      const handler = jest.fn<express.RequestHandler>((_req, res) => {
        sendError(res, 404, "Metric not found");
      });
      const app = buildApp(handler);

      for (const _attempt of [1, 2, 3]) {
        const response = await request(app).get("/thing");
        await drainBackgroundTasks();

        expect(response.status).toBe(404);
        expect(response.body).toStrictEqual({
          status: "fail",
          message: "Metric not found",
        });
      }
      expect(handler).toHaveBeenCalledTimes(3);
      expect(store.size).toBe(0);
    });

    it("stops answering from the handler once a 200 is stored", async () => {
      const handler = jest.fn<express.RequestHandler>((_req, res) => {
        res.status(200).json({ status: "success", data: { id: 1 } });
      });
      const app = buildApp(handler);

      const first = await request(app).get("/thing");
      await drainBackgroundTasks();
      const second = await request(app).get("/thing");

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body).toStrictEqual(first.body);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});
