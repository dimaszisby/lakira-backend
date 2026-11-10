import { describe, it, expect, jest, beforeAll } from "@jest/globals";
import type { Application } from "express";
import request from "supertest";
import { withTestEnv } from "../../helpers/env-test-utils.js";

/**
 * Issue #257 (kit production-readiness D-04, ADR-0061 § Enforcement). The
 * integration suite runs with rate limiting off, and `globalRateLimiter` is built
 * once, from the settings read when its module is first imported. So this loads
 * the app afresh in an isolated module registry, with limiting on and a budget of
 * three, and drives the real `createApp`: its pipeline, its limiter, its routes.
 * `http-pipeline.test.ts` proves the order with a stand-in limiter; this proves the
 * app is wired the way it says. Under NODE_ENV=test the limiter counts in memory.
 */
const ORIGIN = "https://app.example.com";

let app: Application;

beforeAll(async () => {
  await withTestEnv(
    async () => {
      await jest.isolateModulesAsync(async () => {
        const { createApp } = await import("@/app.js");
        const { buildWiredFeatures } =
          await import("@/composition/features.js");
        app = createApp(buildWiredFeatures());
      });
    },
    {
      overrides: {
        DISABLE_RATE_LIMITING: "false",
        RATE_LIMIT_GLOBAL_MAX: "3",
        CORS_ORIGIN: ORIGIN,
      },
    },
  );
});

describe("the real app with rate limiting on (#257)", () => {
  it("counts every request, answers the one past the budget with the envelope, and lets the browser read it", async () => {
    const unknown = () =>
      request(app).get("/api/v1/no-such-route").set("Origin", ORIGIN);

    for (const remaining of ["2", "1", "0"]) {
      const res = await unknown();
      expect(res.status).toBe(404);
      expect(res.headers["ratelimit-remaining"]).toBe(remaining);
    }

    const limited = await unknown();
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      status: "fail",
      message: "Too many requests, please try again later.",
    });
    expect(limited.headers["ratelimit-limit"]).toBe("3");
    expect(limited.headers["retry-after"]).toBeDefined();
    // CORS sits above the limiter, so a browser can read the 429.
    expect(limited.headers["access-control-allow-origin"]).toBe(ORIGIN);

    // The probes sit above the limiter: a platform is never throttled, and no
    // cache may answer for them.
    const health = await request(app).get("/api/v1/health");
    expect(health.status).toBe(200);
    expect(health.headers["cache-control"]).toBe("no-store");
    expect(health.headers["ratelimit-remaining"]).toBeUndefined();

    const ready = await request(app).get("/api/v1/ready");
    expect([200, 503]).toContain(ready.status);
    expect(ready.headers["cache-control"]).toBe("no-store");

    // The API docs sit below the limiter, so they count too: accepted in
    // docs/reference/known-gaps.md.
    const docs = await request(app).get("/api/v1/docs/openapi.json");
    expect(docs.status).toBe(429);
  });
});
