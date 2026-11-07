import { describe, it, expect } from "@jest/globals";
import express from "express";
import cors from "cors";
import request from "supertest";
import { loadEnvOrExit } from "@/config/envManager.js";
import { withTestEnv } from "../../helpers/env-test-utils.js";

// Mirrors the CORS wiring in src/server.ts so per-test CORS_ORIGIN overrides
// (via withTestEnv) actually take effect — the shared `app` import bakes env
// at module load, so a mini-app per test is the only way to assert this.
function buildAppWithCors() {
  const corsOrigins = loadEnvOrExit().CORS_ORIGIN ?? ["http://localhost:3000"];
  const app = express();
  app.use(
    cors({
      origin: corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    }),
  );
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("CORS middleware — multi-origin support", () => {
  it("echoes an allowed origin from a multi-origin CORS_ORIGIN list", async () => {
    await withTestEnv(
      async () => {
        const app = buildAppWithCors();
        const res = await request(app)
          .get("/ping")
          .set("Origin", "https://admin.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe(
          "https://admin.example.com",
        );
      },
      {
        overrides: {
          CORS_ORIGIN: "https://app.example.com,https://admin.example.com",
        },
      },
    );
  });

  it("does not set Access-Control-Allow-Origin for a disallowed origin", async () => {
    await withTestEnv(
      async () => {
        const app = buildAppWithCors();
        const res = await request(app)
          .get("/ping")
          .set("Origin", "https://evil.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      },
      {
        overrides: {
          CORS_ORIGIN: "https://app.example.com,https://admin.example.com",
        },
      },
    );
  });

  it("still works with a single-origin CORS_ORIGIN (backwards compatibility)", async () => {
    await withTestEnv(
      async () => {
        const app = buildAppWithCors();
        const res = await request(app)
          .get("/ping")
          .set("Origin", "https://only.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe(
          "https://only.example.com",
        );
      },
      { overrides: { CORS_ORIGIN: "https://only.example.com" } },
    );
  });

  it("tolerates whitespace around commas in CORS_ORIGIN", async () => {
    await withTestEnv(
      async () => {
        const app = buildAppWithCors();
        const res = await request(app)
          .get("/ping")
          .set("Origin", "https://b.example.com");

        expect(res.status).toBe(200);
        expect(res.headers["access-control-allow-origin"]).toBe(
          "https://b.example.com",
        );
      },
      {
        overrides: {
          CORS_ORIGIN: "  https://a.example.com ,  https://b.example.com  ,  ",
        },
      },
    );
  });
});
