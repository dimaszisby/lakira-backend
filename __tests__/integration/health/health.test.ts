import { describe, it, expect } from "@jest/globals";
import { api } from "../helpers/test-utils.js";

describe("GET /api/v1/health", () => {
  it("returns status, environment, and release", async () => {
    const res = await api.get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.environment).toBeDefined();
    expect(res.body.release).toBeDefined();
    expect(typeof res.body.timestamp).toBe("string");
  });
});
