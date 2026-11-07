import { describe, it, expect } from "@jest/globals";
import express, { type Application, type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { mountHttpPipeline } from "@/shared/middleware/http-pipeline.js";

// ADR-0061 (register row B-06). The integration suite runs with rate limiting
// off, so the order is proved here: a bare app, the real pipeline, a limiter of two.
const ORIGIN = "https://app.example.com";
const MALFORMED = '{"email":"victim@example.com"';

const limiterOf = (max: number): RequestHandler =>
  rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ status: "fail", message: "Too many requests" });
    },
  });

const build = (
  overrides: { max?: number; requireHttps?: boolean; trustProxy?: number } = {},
): Application => {
  const app = express();
  // app.ts sets this from TRUST_PROXY; a bare Express app trusts no proxy.
  app.set("trust proxy", overrides.trustProxy ?? 0);
  mountHttpPipeline(app, {
    limiter: limiterOf(overrides.max ?? 2),
    corsOrigins: [ORIGIN],
    bodyLimit: "1kb",
    requireHttps: overrides.requireHttps ?? false,
    mountProbes: (probed) => {
      probed.get("/probe", (req, res) => {
        res.json({ status: "ok", body: req.body as unknown });
      });
    },
  });
  app.all("/echo", (req, res) => {
    res.json({
      body: req.body as unknown,
      cookies: req.cookies as unknown,
      query: req.query,
    });
  });
  // Stands in for the app's error handler: body-parser's errors carry a status.
  app.use(((err, _req, res, _next) => {
    res.status((err as { status?: number }).status ?? 500).json({
      status: "fail",
      type: (err as { type?: string }).type,
    });
  }) as express.ErrorRequestHandler);
  return app;
};

const postMalformed = (app: Application, path = "/echo") =>
  request(app)
    .post(path)
    .set("Content-Type", "application/json")
    .set("Origin", ORIGIN)
    .send(MALFORMED);

describe("mountHttpPipeline: the order of the global middleware", () => {
  it("answers a probe without parsing the body it was sent", async () => {
    const res = await request(build())
      .get("/probe")
      .set("Content-Type", "application/json")
      .send(MALFORMED);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("counts a request before parsing it: past the limit a malformed body gets 429", async () => {
    const app = build({ max: 2 });

    const statuses = [];
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await postMalformed(app)).status);
    }

    expect(statuses).toEqual([400, 400, 429]);
  });

  it("never throttles a probe, however many requests came before", async () => {
    const app = build({ max: 1 });
    await request(app).get("/echo");
    expect((await request(app).get("/echo")).status).toBe(429);

    const probes = await Promise.all(
      Array.from({ length: 5 }, () => request(app).get("/probe")),
    );

    expect(probes.map((res) => res.status)).toEqual([200, 200, 200, 200, 200]);
  });

  it("does not count a probe against the limit", async () => {
    const app = build({ max: 1 });
    for (let i = 0; i < 5; i += 1) await request(app).get("/probe");

    expect((await request(app).get("/echo")).status).toBe(200);
  });

  it("gives a malformed body, an oversized body and a 429 a request id and security headers", async () => {
    const app = build({ max: 2 });

    const malformed = await postMalformed(app);
    const oversized = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .set("Origin", ORIGIN)
      .send(JSON.stringify({ filler: "x".repeat(2048) }));
    const throttled = await postMalformed(app);

    expect([malformed.status, oversized.status, throttled.status]).toEqual([
      400, 413, 429,
    ]);
    for (const res of [malformed, oversized, throttled]) {
      expect(res.headers["x-request-id"]).toEqual(expect.any(String));
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    }
    expect(throttled.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(throttled.headers["ratelimit-remaining"]).toBe("0");
  });

  it("still hands a route its parsed body, cookies and query", async () => {
    const res = await request(build())
      .post("/echo?sort=name&sort=id&q=a%3Cb")
      .set("Cookie", "session=abc")
      .send({ name: "<script>x</script>" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      // Text arrives as sent; encoding is the renderer's job (ADR-0082).
      // hpp keeps the last of a repeated key.
      body: { name: "<script>x</script>" },
      cookies: { session: "abc" },
      query: { sort: "id", q: "a<b" },
    });
  });

  it("answers TRACE with 405 and a preflight with 204, uncounted", async () => {
    const app = build({ max: 1 });

    const trace = await request(app).trace("/echo");
    const preflight = await request(app)
      .options("/echo")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST");

    expect(trace.status).toBe(405);
    expect(preflight.status).toBe(204);
    expect((await request(app).get("/echo")).status).toBe(200);
  });

  describe("in production mode", () => {
    // Kit error-envelope-residuals, D-10 (register row B-22, audit S13). The redirect
    // used to send the client to https:// plus its own Host header.
    it("refuses plain HTTP with 403 before counting or parsing, and redirects nowhere", async () => {
      const app = build({ max: 1, requireHttps: true });

      const first = await postMalformed(app);
      const second = await postMalformed(app).set("Host", "evil.example");
      const third = await request(app).get("/echo");

      expect([first.status, second.status, third.status]).toEqual([
        403, 403, 403,
      ]);
      for (const res of [first, second, third]) {
        expect(res.headers.location).toBeUndefined();
        expect(res.body).toEqual({
          status: "fail",
          message: "HTTPS is required",
        });
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
      }
    });

    // A platform health check may reach the app without x-forwarded-proto. It got a
    // 301 before, which reads as healthy; a 403 would read as a failed deploy.
    it("still answers a probe over plain HTTP", async () => {
      const probe = await request(build({ requireHttps: true })).get("/probe");

      expect(probe.status).toBe(200);
    });

    // Kit proxy-trust-and-xss-clean, D-01 (audit X12). The header counts only from a
    // hop TRUST_PROXY trusts; before, any client could claim HTTPS for itself.
    it("lets a request through that a trusted proxy marks as HTTPS", async () => {
      const res = await request(build({ requireHttps: true, trustProxy: 1 }))
        .get("/echo")
        .set("x-forwarded-proto", "https");

      expect(res.status).toBe(200);
    });

    it("refuses a request that marks itself as HTTPS when no proxy is trusted", async () => {
      const res = await request(build({ requireHttps: true, trustProxy: 0 }))
        .get("/echo")
        .set("x-forwarded-proto", "https");

      expect(res.status).toBe(403);
    });
  });
});
