import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";

/**
 * ADR-0036 — environment switches whose value would weaken a production security
 * control are refused at the Zod schema layer, so the process fails fast at startup
 * rather than serving traffic with the control silently disabled.
 *
 * `withTestEnv` applies the overrides and calls `loadEnvOrExit()` itself, before it
 * invokes the callback — so a refusal rejects the `withTestEnv` promise rather than
 * throwing inside the callback. Hence `.rejects` / `.resolves` on the whole call.
 */
const noop = () => undefined;

// A *clean* production env. The ambient .env.test sets DISABLE_RATE_LIMITING=true and
// start:test sets ALLOW_TEST_HTTP_SERVER=true, so both are neutralised here — otherwise
// every case would trip on the ambient value instead of the one under test.
const PRODUCTION_BASE: Record<string, string> = {
  NODE_ENV: "production",
  SWAGGER_REQUIRE_AUTH: "true",
  DISABLE_RATE_LIMITING: "false",
  ALLOW_TEST_HTTP_SERVER: "false",
  // npm run test:unit exports SKIP_DB_LIFECYCLE=true, and it is refused in production —
  // without this every case would trip on the ambient value instead of the rule under test.
  SKIP_DB_LIFECYCLE: "false",
  // loadEnv falls back to .env for anything .env.test leaves unset, and a developer's
  // .env commonly says EMAIL_PROVIDER=console, which production refuses (ADR-0049).
  EMAIL_PROVIDER: "resend",
};

const inProduction = (overrides: Record<string, string>) =>
  withTestEnv(noop, { overrides: { ...PRODUCTION_BASE, ...overrides } });

/**
 * envManager wraps the ZodError in an EnvValidationError whose message is the
 * generic "Environment validation failed"; the offending variable is carried in
 * `issues[].path`. Asserting on the path pins the exact rule that fired.
 */
const refusalFor = (name: string) => ({
  issues: expect.arrayContaining([expect.objectContaining({ path: [name] })]),
});

describe("zodEnv production-unsafe switch refusal (ADR-0036)", () => {
  it.each([
    ["DISABLE_RATE_LIMITING", { DISABLE_RATE_LIMITING: "true" }],
    ["ALLOW_TEST_HTTP_SERVER", { ALLOW_TEST_HTTP_SERVER: "true" }],
    ["SWAGGER_REQUIRE_AUTH", { SWAGGER_REQUIRE_AUTH: "false" }],
    // Kit log-redaction-coverage, D-11: SQL text goes to the log with the
    // values of its WHERE clause inlined.
    ["DB_LOGGING", { DB_LOGGING: "true" }],
  ])("refuses %s in production", async (name, overrides) => {
    await expect(inProduction(overrides)).rejects.toMatchObject(
      refusalFor(name),
    );
  });

  it.each([
    ["RABBITMQ_USER", { RABBITMQ_USER: "guest", RABBITMQ_PASSWORD: "secret" }],
    ["RABBITMQ_PASSWORD", { RABBITMQ_USER: "svc", RABBITMQ_PASSWORD: "guest" }],
  ])(
    "refuses default %s when RabbitMQ is enabled in production",
    async (name, overrides) => {
      await expect(
        inProduction({ RABBITMQ_ENABLED: "true", ...overrides }),
      ).rejects.toMatchObject(refusalFor(name));
    },
  );

  it("allows guest RabbitMQ credentials when RabbitMQ is disabled", async () => {
    await expect(
      inProduction({
        RABBITMQ_ENABLED: "false",
        RABBITMQ_USER: "guest",
        RABBITMQ_PASSWORD: "guest",
      }),
    ).resolves.toBeUndefined();
  });

  it("leaves non-production environments untouched", async () => {
    // This is the exact combination `npm run start:test` uses.
    await expect(
      withTestEnv(noop, {
        overrides: {
          NODE_ENV: "test",
          DISABLE_RATE_LIMITING: "true",
          ALLOW_TEST_HTTP_SERVER: "true",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses LOG_LEVEL="silly" in production', async () => {
    await expect(inProduction({ LOG_LEVEL: "silly" })).rejects.toMatchObject(
      refusalFor("LOG_LEVEL"),
    );
  });

  it("allows debug-level logging outside production", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "test", LOG_LEVEL: "silly" },
      }),
    ).resolves.toBeUndefined();
  });

  it("refuses SKIP_DB_LIFECYCLE in production", async () => {
    await expect(
      inProduction({ SKIP_DB_LIFECYCLE: "true" }),
    ).rejects.toMatchObject(refusalFor("SKIP_DB_LIFECYCLE"));
  });

  it("allows SKIP_DB_LIFECYCLE outside production — jest.setup relies on it", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "test", SKIP_DB_LIFECYCLE: "true" },
      }),
    ).resolves.toBeUndefined();
  });

  it('refuses EMAIL_PROVIDER="mailpit" in production (ADR-0048)', async () => {
    await expect(
      inProduction({ EMAIL_PROVIDER: "mailpit" }),
    ).rejects.toMatchObject(refusalFor("EMAIL_PROVIDER"));
  });

  it('allows EMAIL_PROVIDER="mailpit" in staging, for the VPS stack', async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "staging", EMAIL_PROVIDER: "mailpit" },
      }),
    ).resolves.toBeUndefined();
  });

  it.each(["production", "staging"])(
    'refuses EMAIL_PROVIDER="console" when NODE_ENV=%s (ADR-0049)',
    async (nodeEnv) => {
      await expect(
        withTestEnv(noop, {
          overrides: {
            ...PRODUCTION_BASE,
            NODE_ENV: nodeEnv,
            EMAIL_PROVIDER: "console",
          },
        }),
      ).rejects.toMatchObject(refusalFor("EMAIL_PROVIDER"));
    },
  );

  it.each(["development", "test"])(
    'allows EMAIL_PROVIDER="console" when NODE_ENV=%s',
    async (nodeEnv) => {
      await expect(
        withTestEnv(noop, {
          overrides: { NODE_ENV: nodeEnv, EMAIL_PROVIDER: "console" },
        }),
      ).resolves.toBeUndefined();
    },
  );

  it("catches a capitalized NODE_ENV, which a raw process.env check would miss", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "Production", DISABLE_RATE_LIMITING: "true" },
      }),
    ).rejects.toMatchObject(refusalFor("DISABLE_RATE_LIMITING"));
  });

  it("allows DB_LOGGING in development, where it is the local debugging tool", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "development", DB_LOGGING: "true" },
      }),
    ).resolves.toBeUndefined();
  });
});
