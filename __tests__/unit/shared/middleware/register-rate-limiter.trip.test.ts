import { describe, it, expect, jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// The real express-rate-limit, not the options-capturing mock the main limiter
// test uses: this proves the register limit actually trips (audit R1, kit
// register-rate-limiter). It cannot run against the shared app — integration
// tests set DISABLE_RATE_LIMITING=true, and `env` is read once at import — so
// the env is mocked here. NODE_ENV=test selects the in-memory store.
jest.mock("@/config/envManager.js", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_REQUIRED: false,
    DISABLE_RATE_LIMITING: false,
    RATE_LIMIT_REGISTER_IP_MAX: 2,
  },
}));

jest.mock("@/utils/logger.js", () => ({
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: { isOpen: false, sendCommand: jest.fn() },
}));

const buildApp = async () => {
  const { createRegisterIpRateLimiter } =
    await import("@/shared/middleware/rate-limiter.js");
  const app = express();
  // One trusted hop, as src/server.ts defaults to: X-Forwarded-For picks the IP.
  app.set("trust proxy", 1);
  app.post("/register", createRegisterIpRateLimiter(), (_req, res) => {
    res.status(201).json({ status: "success" });
  });
  return app;
};

describe("register IP rate limiter (real limiter)", () => {
  it("rejects the request after RATE_LIMIT_REGISTER_IP_MAX from one IP", async () => {
    const app = await buildApp();
    const send = () =>
      request(app).post("/register").set("X-Forwarded-For", "203.0.113.7");

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);

    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      status: 429,
      message: "Too many registration attempts, please try again later.",
    });
    expect(blocked.headers).toHaveProperty("ratelimit-limit", "2");
  });

  it("keeps a separate budget for each IP", async () => {
    const app = await buildApp();
    const from = (ip: string) =>
      request(app).post("/register").set("X-Forwarded-For", ip);

    await from("203.0.113.8");
    await from("203.0.113.8");
    expect((await from("203.0.113.8")).status).toBe(429);

    expect((await from("198.51.100.9")).status).toBe(201);
  });
});
