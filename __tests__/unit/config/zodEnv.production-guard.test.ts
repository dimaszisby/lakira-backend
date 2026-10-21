import { describe, it, expect, jest } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";
import { loadEnvOrExit } from "@/config/envManager.js";

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

// Not a secret: 40 characters, to clear the 32 that production and staging ask for.
const LONG_SECRET = "unit-test-only-not-a-secret-0123456789ab";
const TEMPLATE_PLACEHOLDER = "replace-with-a-long-random-secret";

// A *clean* production env. The ambient .env.test sets DISABLE_RATE_LIMITING=true and
// start:test sets ALLOW_TEST_HTTP_SERVER=true, so both are neutralised here — otherwise
// every case would trip on the ambient value instead of the one under test.
const PRODUCTION_BASE: Record<string, string> = {
  NODE_ENV: "production",
  // Production and staging refuse a short secret. The ambient one is whatever
  // .env.test or the CI secret holds, and its length is not this suite's to assume.
  JWT_SECRET: LONG_SECRET,
  SWAGGER_REQUIRE_AUTH: "true",
  DISABLE_RATE_LIMITING: "false",
  ALLOW_TEST_HTTP_SERVER: "false",
  // npm run test:unit exports SKIP_DB_LIFECYCLE=true, and it is refused in production —
  // without this every case would trip on the ambient value instead of the rule under test.
  SKIP_DB_LIFECYCLE: "false",
  // loadEnv falls back to .env for anything .env.test leaves unset, and a developer's
  // .env commonly says EMAIL_PROVIDER=console, which production refuses (ADR-0049).
  EMAIL_PROVIDER: "resend",
  // A developer's .env commonly sets this false for a local database, and production
  // refuses it (database-tls-and-staging-refusals D-01).
  DB_SSL_REJECT_UNAUTHORIZED: "true",
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

  // Register row B-12 (audit 2026-10-12, W4). The connection uses RABBITMQ_URL as
  // given whenever it is set and ignores the two fields, so the refusal has to
  // judge the URL then. A URL that names no credentials connects as guest too:
  // the client fills them in.
  describe("RabbitMQ credentials given by URL", () => {
    const BROKER_HOST = "broker.internal.example";
    const withQueue = (overrides: Record<string, string>) =>
      inProduction({ RABBITMQ_ENABLED: "true", ...overrides });

    it.each([
      ["guest as user and password", `amqp://guest:guest@${BROKER_HOST}:5672`],
      ["guest as the password only", `amqp://svc:guest@${BROKER_HOST}:5672`],
      ["guest as the user only", `amqp://guest:Str0ngPw@${BROKER_HOST}:5672`],
      ["no credentials at all", `amqp://${BROKER_HOST}:5672`],
    ])("refuses a URL with %s, whatever the two fields say", async (_, url) => {
      await expect(
        withQueue({
          RABBITMQ_URL: url,
          RABBITMQ_USER: "svc",
          RABBITMQ_PASSWORD: "Str0ngPw",
        }),
      ).rejects.toMatchObject(refusalFor("RABBITMQ_URL"));
    });

    it("accepts a URL with real credentials when the two fields are still guest", async () => {
      await expect(
        withQueue({
          RABBITMQ_URL: `amqp://svc:Str0ngPw@${BROKER_HOST}:5672/vh`,
          RABBITMQ_USER: "guest",
          RABBITMQ_PASSWORD: "guest",
        }),
      ).resolves.toBeUndefined();
    });

    it("names the variable and never the URL, in the issue or the logged line", async () => {
      const errorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      try {
        const failure = await withQueue({
          RABBITMQ_URL: `amqp://guest:guest@${BROKER_HOST}:5672`,
          RABBITMQ_USER: "svc",
          RABBITMQ_PASSWORD: "Str0ngPw",
        }).catch((error: unknown) => error);
        const logged = JSON.stringify(errorSpy.mock.calls);

        expect(errorSpy).toHaveBeenCalled();
        expect(logged).toContain("RABBITMQ_URL cannot log in as");
        for (const text of [JSON.stringify(failure), logged]) {
          expect(text).not.toContain(BROKER_HOST);
          expect(text).not.toContain("amqp://");
        }
      } finally {
        errorSpy.mockRestore();
      }
    });

    it("allows a guest URL when RabbitMQ is disabled", async () => {
      await expect(
        inProduction({
          RABBITMQ_ENABLED: "false",
          RABBITMQ_URL: `amqp://guest:guest@${BROKER_HOST}:5672`,
        }),
      ).resolves.toBeUndefined();
    });

    it("allows the guest URL Compose passes in development", async () => {
      await expect(
        withTestEnv(noop, {
          overrides: {
            NODE_ENV: "development",
            RABBITMQ_ENABLED: "true",
            RABBITMQ_URL: "amqp://guest:guest@rabbitmq:5672",
          },
        }),
      ).resolves.toBeUndefined();
    });
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
        overrides: {
          ...PRODUCTION_BASE,
          NODE_ENV: "staging",
          EMAIL_PROVIDER: "mailpit",
        },
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

  // Kit jwt-secret-minimum-length, D-01.
  describe.each(["production", "staging"])(
    "JWT_SECRET when NODE_ENV=%s",
    (nodeEnv) => {
      const withSecret = (secret: string) =>
        withTestEnv(noop, {
          overrides: {
            ...PRODUCTION_BASE,
            NODE_ENV: nodeEnv,
            JWT_SECRET: secret,
          },
        });

      it.each([
        ["one character", "a"],
        ["31 characters", "x".repeat(31)],
      ])("refuses a secret of %s", async (_label, secret) => {
        await expect(withSecret(secret)).rejects.toMatchObject(
          refusalFor("JWT_SECRET"),
        );
      });

      it("accepts a secret of exactly 32 characters", async () => {
        await expect(withSecret("x".repeat(32))).resolves.toBeUndefined();
      });

      it("refuses the placeholder from .env.example, which is long enough", async () => {
        expect(TEMPLATE_PLACEHOLDER.length).toBeGreaterThanOrEqual(32);

        await expect(withSecret(TEMPLATE_PLACEHOLDER)).rejects.toMatchObject({
          issues: [
            expect.objectContaining({
              path: ["JWT_SECRET"],
              message: expect.stringContaining("placeholder"),
            }),
          ],
        });
      });

      it("names the rule and never the value, in the issue or the logged line", async () => {
        const secret = "short-and-recognisable";
        const errorSpy = jest
          .spyOn(console, "error")
          .mockImplementation(() => undefined);

        try {
          const failure = await withSecret(secret).catch(
            (error: unknown) => error,
          );

          expect(JSON.stringify(failure)).not.toContain(secret);
          expect(errorSpy).toHaveBeenCalled();
          expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(secret);
          expect(JSON.stringify(errorSpy.mock.calls)).toContain(
            "JWT_SECRET must be at least 32 characters",
          );
        } finally {
          errorSpy.mockRestore();
        }
      });
    },
  );

  it.each(["development", "test"])(
    "accepts a short JWT_SECRET and the placeholder when NODE_ENV=%s",
    async (nodeEnv) => {
      for (const secret of ["a", TEMPLATE_PLACEHOLDER]) {
        await expect(
          withTestEnv(noop, {
            overrides: { NODE_ENV: nodeEnv, JWT_SECRET: secret },
          }),
        ).resolves.toBeUndefined();
      }
    },
  );

  it("allows DB_LOGGING in development, where it is the local debugging tool", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: { NODE_ENV: "development", DB_LOGGING: "true" },
      }),
    ).resolves.toBeUndefined();
  });
});

// Kit database-tls-and-staging-refusals, D-02 (audit 2026-10-20, X2). Staging is
// reachable from the internet, so it takes the production refusals; only
// EMAIL_PROVIDER="mailpit" stays allowed there (ADR-0048).
describe("zodEnv refusals in staging (ADR-0036)", () => {
  const inStaging = (overrides: Record<string, string>) =>
    withTestEnv(noop, {
      overrides: { ...PRODUCTION_BASE, NODE_ENV: "staging", ...overrides },
    });

  it("starts with a clean staging env", async () => {
    await expect(inStaging({})).resolves.toBeUndefined();
  });

  it.each([
    ["DISABLE_RATE_LIMITING", { DISABLE_RATE_LIMITING: "true" }],
    ["ALLOW_TEST_HTTP_SERVER", { ALLOW_TEST_HTTP_SERVER: "true" }],
    ["SWAGGER_REQUIRE_AUTH", { SWAGGER_REQUIRE_AUTH: "false" }],
    ["DB_LOGGING", { DB_LOGGING: "true" }],
    ["SKIP_DB_LIFECYCLE", { SKIP_DB_LIFECYCLE: "true" }],
    ["LOG_LEVEL", { LOG_LEVEL: "silly" }],
    [
      "RABBITMQ_USER",
      {
        RABBITMQ_ENABLED: "true",
        RABBITMQ_USER: "guest",
        RABBITMQ_PASSWORD: "Str0ngPw",
      },
    ],
    [
      "RABBITMQ_URL",
      {
        RABBITMQ_ENABLED: "true",
        RABBITMQ_URL: "amqp://guest:guest@broker.internal.example:5672",
      },
    ],
  ])("refuses %s, naming staging", async (name, overrides) => {
    await expect(inStaging(overrides)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: [name],
          message: expect.stringContaining("NODE_ENV=staging"),
        }),
      ]),
    });
  });

  it('still allows EMAIL_PROVIDER="mailpit"', async () => {
    await expect(
      inStaging({ EMAIL_PROVIDER: "mailpit" }),
    ).resolves.toBeUndefined();
  });
});

// Kit database-tls-and-staging-refusals, D-01 (audit 2026-10-20, X1).
describe("DB_SSL_REJECT_UNAUTHORIZED", () => {
  it("is refused as false in production", async () => {
    await expect(
      inProduction({ DB_SSL_REJECT_UNAUTHORIZED: "false" }),
    ).rejects.toMatchObject(refusalFor("DB_SSL_REJECT_UNAUTHORIZED"));
  });

  it("is accepted as false in staging, as an explicit opt-out", async () => {
    await expect(
      withTestEnv(noop, {
        overrides: {
          ...PRODUCTION_BASE,
          NODE_ENV: "staging",
          DB_SSL_REJECT_UNAUTHORIZED: "false",
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("is accepted as true in production", async () => {
    await expect(
      inProduction({ DB_SSL_REJECT_UNAUTHORIZED: "true" }),
    ).resolves.toBeUndefined();
  });
});

// Kit database-tls-and-staging-refusals, D-04. Not a real certificate: the schema
// checks the PEM frame only; the TLS handshake judges the rest.
const PEM =
  "-----BEGIN CERTIFICATE-----\nMIIBfakeFakeFake\n-----END CERTIFICATE-----";

describe("DB_SSL_CA", () => {
  const caOf = (value: string) =>
    withTestEnv(() => loadEnvOrExit().DB_SSL_CA, {
      overrides: { ...PRODUCTION_BASE, DB_SSL_CA: value },
    });

  it("accepts a PEM certificate", async () => {
    await expect(caOf(PEM)).resolves.toBe(PEM);
  });

  it("reads a literal \\n as a newline, for a one-line variable", async () => {
    await expect(caOf(PEM.replace(/\n/g, "\\n"))).resolves.toBe(PEM);
  });

  it("refuses a value that holds no certificate, without quoting it", async () => {
    const failure = await caOf("not-a-certificate-value").catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject(refusalFor("DB_SSL_CA"));
    expect(JSON.stringify(failure)).not.toContain("not-a-certificate-value");
  });

  it("is absent when unset", async () => {
    await expect(caOf("")).resolves.toBeUndefined();
  });
});
