import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { api } from "../helpers/test-utils.js";
import sequelize from "@/config/db.js";
import { redisClient } from "@/utils/redis-client.js";

// The probe holds its result for a window (kit production-readiness, D-03), and these
// cases run well inside one. Each starts a minute later by the clock the probe reads.
const realNow = Date.now.bind(Date);
let skew = 0;

beforeEach(() => {
  skew += 60_000;
  const offset = skew;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + offset);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/v1/ready", () => {
  it("returns 200 with both checks ok when db and redis respond", async () => {
    jest.spyOn(redisClient, "ping").mockResolvedValueOnce("PONG");

    const res = await api.get("/api/v1/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.db).toBe("ok");
    expect(res.body.checks.redis).toBe("ok");
  });

  it("returns 503 with db:fail when sequelize.authenticate throws", async () => {
    jest
      .spyOn(sequelize, "authenticate")
      .mockRejectedValueOnce(new Error("DB connection refused"));
    jest.spyOn(redisClient, "ping").mockResolvedValueOnce("PONG");

    const res = await api.get("/api/v1/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.db).toBe("fail");
    expect(res.body.checks.redis).toBe("ok");
  });

  it("returns 503 with redis:fail when redis.ping throws", async () => {
    jest
      .spyOn(redisClient, "ping")
      .mockRejectedValueOnce(new Error("Redis not connected"));

    const res = await api.get("/api/v1/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
    expect(res.body.checks.db).toBe("ok");
    expect(res.body.checks.redis).toBe("fail");
  });

  it("checks the database once for requests inside one window", async () => {
    const authenticate = jest.spyOn(sequelize, "authenticate");
    const ping = jest.spyOn(redisClient, "ping").mockResolvedValue("PONG");

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => api.get("/api/v1/ready")),
    );
    const after = await api.get("/api/v1/ready");

    expect(responses.map((r) => r.status)).toEqual(Array(20).fill(200));
    expect(after.status).toBe(200);
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("serves a failure for the window too", async () => {
    const authenticate = jest
      .spyOn(sequelize, "authenticate")
      .mockRejectedValueOnce(new Error("DB connection refused"));
    jest.spyOn(redisClient, "ping").mockResolvedValue("PONG");

    const first = await api.get("/api/v1/ready");
    const second = await api.get("/api/v1/ready");

    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
    expect(second.body).toEqual(first.body);
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("is reachable without a JWT (unauthenticated)", async () => {
    jest.spyOn(redisClient, "ping").mockResolvedValueOnce("PONG");

    const res = await api.get("/api/v1/ready");
    expect(res.status).not.toBe(401);
  });

  // ADR-0061: the probes are mounted ahead of the body parsers.
  it("ignores a body it is sent, malformed or not", async () => {
    jest.spyOn(redisClient, "ping").mockResolvedValueOnce("PONG");

    const res = await api
      .get("/api/v1/ready")
      .set("Content-Type", "application/json")
      .send('{"not":"closed"');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
