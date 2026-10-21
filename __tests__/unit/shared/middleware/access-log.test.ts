import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

jest.mock("@/utils/logger.js", () => ({
  __esModule: true,
  default: { http: jest.fn() },
}));

const { default: loggerMock } = jest.requireMock("@/utils/logger.js") as {
  default: { http: jest.Mock };
};

const { accessLogMiddleware } = jest.requireActual<
  typeof import("@/shared/middleware/access-log.js")
>("@/shared/middleware/access-log.js");

/** Minimal app exercising the middleware exactly as server.ts mounts it. */
const buildApp = () => {
  const app = express();
  app.use(accessLogMiddleware);
  app.get("/api/v1/health", (_req, res) => void res.status(200).json({}));
  app.get("/api/v1/ready", (_req, res) => void res.status(200).json({}));
  app.get("/api/v1/metrics", (_req, res) => void res.status(401).json({}));
  app.use((_req, res) => void res.status(404).json({}));
  return app;
};

const lastCall = () =>
  loggerMock.http.mock.calls[loggerMock.http.mock.calls.length - 1] as [
    string,
    Record<string, unknown>,
  ];

describe("accessLogMiddleware (ADR-0041)", () => {
  beforeEach(() => {
    loggerMock.http.mockClear();
  });

  it("logs the path and drops the query string", async () => {
    await request(buildApp()).get(
      "/api/v1/metrics?q=secret-search&filter=topsecret",
    );

    expect(loggerMock.http).toHaveBeenCalledTimes(1);
    const [message, meta] = lastCall();
    expect(message).toBe("http_request");
    expect(meta.path).toBe("/api/v1/metrics");

    // The whole point: SENSITIVE_KEY_PATTERN redacts metadata, not URL strings,
    // so query values must never reach the stream in the first place.
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("secret-search");
    expect(serialized).not.toContain("topsecret");
  });

  // log-and-ci-leaks D-02 (audit 2026-10-20 X5): an unmatched route's path kept its address.
  it.each([
    "/api/v1/users/victim@example.com",
    "/api/v1/users/victim%40example.com",
  ])("masks an address in the path %s", async (path) => {
    await request(buildApp()).get(`${path}/x?q=1`);

    const [, meta] = lastCall();
    expect(meta.path).toBe("/api/v1/users/[email]/x");
    expect(JSON.stringify(meta)).not.toMatch(/victim/);
  });

  it.each(["/api/v1/health", "/api/v1/ready"])(
    "excludes the %s probe",
    async (probe) => {
      await request(buildApp()).get(probe);
      expect(loggerMock.http).not.toHaveBeenCalled();
    },
  );

  it("records method, status and duration", async () => {
    await request(buildApp()).get("/api/v1/metrics");

    const [, meta] = lastCall();
    expect(meta.method).toBe("GET");
    expect(meta.status).toBe(401);
    expect(typeof meta.durationMs).toBe("number");
  });
});
