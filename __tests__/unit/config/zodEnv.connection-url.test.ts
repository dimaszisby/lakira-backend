import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";

/**
 * Kit log-redaction-coverage, D-10. A connection URL that fails validation used
 * to be quoted whole in the startup error, password included, and printed twice:
 * in envManager's [ENV_ERROR] line and by Node when the thrown error went
 * uncaught. The message now names the variable and the reason only.
 */
const USER = "svc_user";
const PASSWORD = "S3cretPw";
const HOST = "db.internal.example";

type Case = { variable: string; url: string };

const REJECTED: Case[] = [
  // The wrong scheme: the URL parses, so its parts could have been read.
  { variable: "REDIS_URL", url: `http://${USER}:${PASSWORD}@${HOST}:6379` },
  { variable: "RABBITMQ_URL", url: `http://${USER}:${PASSWORD}@${HOST}:5672` },
  // Not a URL at all: `new URL` throws, as it does for a password holding "/".
  {
    variable: "DEVELOPMENT_DATABASE_URL",
    url: `postgresql://${USER}:${PASSWORD}@${HOST}:notaport/app`,
  },
  {
    variable: "REDIS_URL",
    url: `redis://${USER}:${PASSWORD}@${HOST}:notaport`,
  },
  // Parses, then fails while its parts are decoded: a malformed escape.
  {
    variable: "RABBITMQ_URL",
    url: `amqp://${USER}%zz:${PASSWORD}@${HOST}:5672`,
  },
];

const load = (overrides: Record<string, string>) =>
  withTestEnv(() => undefined, {
    overrides: { NODE_ENV: "development", ...overrides },
  });

describe("a rejected connection URL at startup", () => {
  let printed: string[];
  let spy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    printed = [];
    spy = jest.spyOn(console, "error").mockImplementation((...args) => {
      printed.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it.each(REJECTED)(
    "names $variable and prints no part of its value",
    async ({ variable, url }) => {
      const error = await load({ [variable]: url }).then(
        () => null,
        (reason: unknown) => reason as Error,
      );

      expect(error).toBeInstanceOf(Error);
      const thrown = `${error?.message}\n${error?.stack}\n${JSON.stringify(error)}`;
      const everything = [thrown, ...printed].join("\n");

      expect(error?.message).toContain(`${variable} is invalid`);
      expect(printed.some((line) => line.includes("[ENV_ERROR]"))).toBe(true);
      expect(everything).not.toContain(PASSWORD);
      expect(everything).not.toContain(USER);
      expect(everything).not.toContain(HOST);
    },
  );

  it("still accepts a valid URL of each kind and reads its parts", async () => {
    await withTestEnv(
      async () => {
        const { loadEnvOrExit } = await import("@/config/envManager.js");
        const env = loadEnvOrExit();
        expect(env.REDIS_HOST).toBe("cache.example");
        expect(env.REDIS_PORT).toBe(6380);
        expect(env.RABBITMQ_HOST).toBe("queue.example");
        expect(env.RABBITMQ_PORT).toBe(5673);
        expect(env.DB_HOST).toBe("pg.example");
        expect(env.DB_PORT).toBe(5433);
      },
      {
        overrides: {
          NODE_ENV: "development",
          REDIS_URL: "redis://:pw@cache.example:6380",
          RABBITMQ_URL: "amqp://svc:pw@queue.example:5673/vh",
          DEVELOPMENT_DATABASE_URL: "postgresql://svc:pw@pg.example:5433/app",
        },
      },
    );
  });
});
