import { describe, it, expect, jest } from "@jest/globals";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { hashEmail } from "@/utils/email-hash.js";

// The real express-rate-limit, as in register-rate-limiter.trip.test.ts: this
// proves what a throttled client actually receives from every limiter (C3
// residual 3, kit error-envelope-residuals AC-5). Each limit is mocked to 1 so
// the second request trips it. NODE_ENV=test selects the in-memory store.
jest.mock("@/config/envManager.js", () => ({
  env: {
    NODE_ENV: "test",
    REDIS_REQUIRED: false,
    DISABLE_RATE_LIMITING: false,
    RATE_LIMIT_GLOBAL_MAX: 1,
    RATE_LIMIT_USER_MAX: 1,
    RATE_LIMIT_ANALYTICS_MAX: 1,
    RATE_LIMIT_SWITCH_ORG_MAX: 1,
    RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX: 1,
    RATE_LIMIT_PASSWORD_RESET_IP_MAX: 1,
    RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX: 1,
    RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX: 1,
    RATE_LIMIT_REGISTER_IP_MAX: 1,
  },
}));

jest.mock("@/utils/logger.js", () => ({
  warn: jest.fn(),
  info: jest.fn(),
}));

jest.mock("@/utils/redis-client.js", () => ({
  redisClient: { isOpen: false, sendCommand: jest.fn() },
}));

const loggerMock = jest.requireMock("@/utils/logger.js") as {
  warn: jest.Mock;
};

type LimiterModule = typeof import("@/shared/middleware/rate-limiter.js");
type FactoryName = Extract<keyof LimiterModule, `create${string}RateLimiter`>;

const BODY_EMAIL = "someone@example.com";
// Mixed case on purpose: the limiter lower-cases the address before use.
const USER = { id: "user-1", email: "Member@Example.com" };

// Factory, the message a client gets, and the start of the warn line. Requests
// here carry no user, so each line names the IP, or the hash of the email from
// the body.
const LIMITERS: [FactoryName, string, string][] = [
  [
    "createGlobalRateLimiter",
    "Too many requests, please try again later.",
    "Rate limit exceeded for IP: ",
  ],
  [
    "createUserRateLimiter",
    "Too many requests, please try again later.",
    "Rate limit exceeded for IP: ",
  ],
  [
    "createAnalyticsRateLimiter",
    "Too many visualization requests, slow down.",
    "Analytics rate limit exceeded for ",
  ],
  [
    "createSwitchOrgRateLimiter",
    "Too many organization switch requests, please try again later.",
    "Switch-org rate limit exceeded for ",
  ],
  [
    "createPasswordResetEmailRateLimiter",
    "Too many password reset requests, please try again later.",
    `Password reset email rate limit hit for email hash ${hashEmail(BODY_EMAIL)}`,
  ],
  [
    "createPasswordResetIpRateLimiter",
    "Too many password reset requests, please try again later.",
    "Password reset IP rate limit hit for ",
  ],
  [
    "createEmailVerificationEmailRateLimiter",
    "Too many verification email requests, please try again later.",
    "Email verification email rate limit hit for ",
  ],
  [
    "createEmailVerificationIpRateLimiter",
    "Too many verification email requests, please try again later.",
    "Email verification IP rate limit hit for ",
  ],
  [
    "createRegisterIpRateLimiter",
    "Too many registration attempts, please try again later.",
    "Registration IP rate limit hit for ",
  ],
];

const buildApp = (limiter: RequestHandler, user?: typeof USER) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) Object.assign(req, { user });
    next();
  });
  app.post("/limited", limiter, (_req, res) => {
    res.status(200).json({ status: "success" });
  });
  return app;
};

describe("rate limiters answer through the error envelope", () => {
  it("covers every limiter factory the module exports", async () => {
    const limiters = await import("@/shared/middleware/rate-limiter.js");
    const exported = Object.keys(limiters).filter((name) =>
      /^create.*RateLimiter$/.test(name),
    );

    expect(LIMITERS.map(([name]) => name).sort()).toEqual(exported.sort());
  });

  it.each(LIMITERS)("%s", async (factory, message, logLine) => {
    const limiters = await import("@/shared/middleware/rate-limiter.js");
    const app = buildApp(limiters[factory]() as RequestHandler);
    const send = () =>
      request(app).post("/limited").send({ email: BODY_EMAIL });

    expect((await send()).status).toBe(200);
    loggerMock.warn.mockClear();
    const blocked = await send();

    expect(blocked.status).toBe(429);
    expect(blocked.type).toBe("application/json");
    expect(blocked.body).toStrictEqual({ status: "fail", message });
    expect(blocked.headers["ratelimit-limit"]).toBe("1");
    expect(blocked.headers["ratelimit-remaining"]).toBe("0");
    expect(blocked.headers["ratelimit-reset"]).toBeDefined();
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.stringContaining(logLine),
    );
  });

  // Audit S8, kit log-redaction-coverage D-05. Redaction is by metadata key, so
  // an address inside a message is never masked. Each limiter is tripped with
  // an email in the body and one on the user, and may log neither.
  it.each(LIMITERS)("%s logs no email address", async (factory) => {
    const limiters = await import("@/shared/middleware/rate-limiter.js");
    const app = buildApp(limiters[factory]() as RequestHandler, USER);
    const send = () =>
      request(app).post("/limited").send({ email: BODY_EMAIL });

    await send();
    loggerMock.warn.mockClear();
    expect((await send()).status).toBe(429);

    const logged = JSON.stringify(loggerMock.warn.mock.calls).toLowerCase();
    expect(logged).not.toContain(BODY_EMAIL);
    expect(logged).not.toContain(USER.email.toLowerCase());
    expect(logged).not.toContain("undefined");
  });

  it("names the email hash in full when the password reset limiter trips", async () => {
    const limiters = await import("@/shared/middleware/rate-limiter.js");
    const app = buildApp(
      limiters.createPasswordResetEmailRateLimiter() as RequestHandler,
    );
    const send = () =>
      request(app).post("/limited").send({ email: " Someone@Example.com " });

    await send();
    loggerMock.warn.mockClear();
    expect((await send()).status).toBe(429);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      `Password reset email rate limit hit for email hash ${hashEmail(BODY_EMAIL)}`,
    );
  });

  // The fallback branches: no usable email in the body, and a user with no id.
  const FALLBACKS: [FactoryName, object, Partial<typeof USER> | undefined][] = [
    ["createPasswordResetEmailRateLimiter", { email: "   " }, undefined],
    ["createPasswordResetEmailRateLimiter", { email: 42 }, undefined],
    ["createEmailVerificationEmailRateLimiter", {}, { email: USER.email }],
  ];

  it.each(FALLBACKS)(
    "%s falls back to the IP for %j",
    async (factory, body, user) => {
      const limiters = await import("@/shared/middleware/rate-limiter.js");
      const app = buildApp(
        limiters[factory]() as RequestHandler,
        user as typeof USER | undefined,
      );
      const send = () => request(app).post("/limited").send(body);

      await send();
      loggerMock.warn.mockClear();
      expect((await send()).status).toBe(429);

      const [line] = loggerMock.warn.mock.calls[0] as [string];
      expect(line).toMatch(/rate limit hit for [0-9a-f:.]+$/);
      expect(line.toLowerCase()).not.toContain(USER.email.toLowerCase());
    },
  );

  it("names the user, not the email, when the verification limiter trips", async () => {
    const limiters = await import("@/shared/middleware/rate-limiter.js");
    const app = buildApp(
      limiters.createEmailVerificationEmailRateLimiter() as RequestHandler,
      USER,
    );
    const send = () => request(app).post("/limited").send({});

    await send();
    loggerMock.warn.mockClear();
    expect((await send()).status).toBe(429);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      `Email verification email rate limit hit for user ${USER.id}`,
    );
  });
});
