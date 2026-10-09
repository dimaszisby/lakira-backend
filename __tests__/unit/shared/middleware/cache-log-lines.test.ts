import {
  describe,
  beforeEach,
  afterEach,
  it,
  expect,
  jest,
} from "@jest/globals";
import { Writable } from "node:stream";
import type { Response } from "express";
import { transports } from "winston";
import logger from "@/utils/logger.js";
import { cacheMiddleware } from "@/shared/middleware/cache.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";
import { cacheEntryName } from "@/utils/cache-entry-name.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";
import type { AuthRequest } from "@/types/request.context.js";

// Kit log-redaction-coverage, D-08. The real logger, because redaction is by
// metadata key and never scans message text: only the written line shows
// whether a key reached it. cacheMiddleware is skipped under NODE_ENV=test, so
// no integration test reaches these lines.
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

const SEARCH = "victim@example.com";
const NAME_FILTER = "Jane Doe";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";

// The shape `GET /metrics` builds its key in.
const key = buildCursorCacheKey({
  feature: "metrics",
  version: 3,
  userId: USER_ID,
  organizationId: ORG_ID,
  segments: [
    ["l", 20],
    ["s", "-createdAt"],
    ["q", SEARCH],
    ["fn", NAME_FILTER],
    ["fc", ""],
    ["after", ""],
    ["it", false],
  ],
});

const createResponse = () => {
  const res = { statusCode: 200 } as unknown as Response & {
    statusCode: number;
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response["status"];
  res.json = jest.fn(() => res) as unknown as Response["json"];
  return res;
};

describe("cacheMiddleware: what its log lines carry", () => {
  let lines: string[];
  let capture: InstanceType<typeof transports.Stream>;

  const run = async () => {
    const res = createResponse();
    await cacheMiddleware(() => key, 60, { disableInTest: false })(
      {} as AuthRequest,
      res,
      jest.fn(),
    );
    return res;
  };

  const expectNoRequestText = () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(SEARCH);
      expect(line).not.toContain(NAME_FILTER);
      expect(line).not.toContain(key);
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    redisClient.get.mockResolvedValue(null);
    redisClient.setEx.mockResolvedValue();
    lines = [];
    capture = new transports.Stream({
      stream: new Writable({
        write(chunk, _encoding, done) {
          lines.push(String(chunk));
          done();
        },
      }),
    });
    logger.add(capture);
  });

  afterEach(() => {
    logger.remove(capture);
  });

  it("writes no search text on a miss and a store", async () => {
    const res = await run();
    res.json({ data: "fresh" });
    await drainBackgroundTasks();

    expect(redisClient.setEx).toHaveBeenCalledWith(key, 60, expect.any(String));
    expect(lines).toHaveLength(2);
    expectNoRequestText();
  });

  it("writes no search text on a hit", async () => {
    redisClient.get.mockResolvedValueOnce(JSON.stringify({ data: "cached" }));

    await run();

    expect(lines).toHaveLength(1);
    expectNoRequestText();
  });

  it("writes no search text when the store fails", async () => {
    redisClient.setEx.mockRejectedValueOnce(new Error("redis went away"));

    const res = await run();
    res.json({ data: "fresh" });
    await drainBackgroundTasks();

    expect(lines.some((line) => line.includes("cache-write"))).toBe(true);
    expectNoRequestText();
  });

  // D-09. JSON.parse's message quotes the start of what it could not read,
  // which here is a stored response.
  it("logs a cache entry that does not parse by name, and treats it as a miss", async () => {
    redisClient.get.mockResolvedValueOnce(`{"owner":"${SEARCH}"`);
    const next = jest.fn();
    const res = createResponse();

    await cacheMiddleware(() => key, 60, { disableInTest: false })(
      {} as AuthRequest,
      res,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expectNoRequestText();
    expect(lines.some((line) => line.includes("unreadable"))).toBe(true);
    expect(lines.every((line) => line.includes(cacheEntryName(key)))).toBe(
      true,
    );
  });

  it("names the entry the same way on the miss, the store and the hit", async () => {
    const name = cacheEntryName(key);
    expect(name).toMatch(/^cursor:metrics:v3#[0-9a-f]{12}$/);

    const res = await run();
    res.json({ data: "fresh" });
    await drainBackgroundTasks();
    redisClient.get.mockResolvedValueOnce(JSON.stringify({ data: "cached" }));
    await run();

    const messages = lines.map(
      (line) => (JSON.parse(line) as { message: string }).message,
    );
    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message).toContain(name);
    }
  });
});
