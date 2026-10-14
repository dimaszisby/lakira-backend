import { describe, it, expect } from "@jest/globals";
import http from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import app from "@/server.js";
import { api } from "../helpers/test-utils.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Request-ID middleware", () => {
  it("echoes a provided x-request-id header back in the response", async () => {
    const customId = "my-trace-id-abc123";
    const res = await api.get("/api/v1/health").set("x-request-id", customId);
    expect(res.headers["x-request-id"]).toBe(customId);
  });

  it("generates a UUID v4 when no x-request-id header is provided", async () => {
    const res = await api.get("/api/v1/health");
    expect(res.headers["x-request-id"]).toMatch(UUID_PATTERN);
  });

  it("two sequential requests receive distinct generated IDs", async () => {
    const res1 = await api.get("/api/v1/health");
    const res2 = await api.get("/api/v1/health");
    expect(res1.headers["x-request-id"]).toMatch(UUID_PATTERN);
    expect(res2.headers["x-request-id"]).toMatch(UUID_PATTERN);
    expect(res1.headers["x-request-id"]).not.toBe(res2.headers["x-request-id"]);
  });

  // Register row B-14 (kit observability, D-05): only 1 to 64 characters of
  // [A-Za-z0-9._-] are honoured; anything else is replaced, not echoed.
  it.each([
    ["65 characters", "a".repeat(65)],
    ["a space", "trace id"],
  ])("replaces a value with %s by a minted UUID", async (_, sent) => {
    const res = await api.get("/api/v1/health").set("x-request-id", sent);

    expect(res.headers["x-request-id"]).toMatch(UUID_PATTERN);
    expect(res.headers["x-request-id"]).not.toContain(sent);
  });

  // supertest sets a header once, so the request is written by hand: two
  // x-request-id lines on the wire, which Node joins as "first-id, second-id".
  it("replaces a header sent twice by a minted UUID", async () => {
    const server = http.createServer(app).listen(0);
    try {
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        http
          .request({
            port,
            path: "/api/v1/health",
            // A raw header list gets no Host added, and HTTP/1.1 refuses a
            // request without one.
            headers: [
              "host",
              `127.0.0.1:${port}`,
              "x-request-id",
              "first-id",
              "x-request-id",
              "second-id",
            ],
          })
          .on("response", resolve)
          .on("error", reject)
          .end();
      });
      res.resume();

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-request-id"]).toMatch(UUID_PATTERN);
    } finally {
      server.close();
    }
  });
});
