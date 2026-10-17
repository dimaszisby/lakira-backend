import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";
import { loadEnvOrExit } from "@/config/envManager.js";

/**
 * Kit log-redaction-coverage, D-17 (register row B-21). The schema lowercases
 * NODE_ENV, but its defaults compared the raw value, read once at import. With
 * NODE_ENV=Production the app ran as production while DB_SSL_REJECT_UNAUTHORIZED
 * defaulted to false, so the database's certificate went unchecked.
 */

// Not a secret: 40 characters, to clear the 32 that production asks for.
const LONG_SECRET = "unit-test-only-not-a-secret-0123456789ab";

// The variables whose defaults are under test. A developer's .env sets several of
// them, and loadEnv falls back to it, so each is unset to reach the default.
const UNSET = {
  DB_SSL_REJECT_UNAUTHORIZED: undefined,
  LOG_LEVEL: undefined,
  ENABLE_DUMMY_ENDPOINTS: undefined,
  DB_LOGGING: undefined,
  REDIS_REQUIRED: undefined,
  EMAIL_PROVIDER: undefined,
};

// What production refuses or requires, as in zodEnv.production-guard.test.ts.
const PRODUCTION_SAFE = {
  JWT_SECRET: LONG_SECRET,
  SWAGGER_REQUIRE_AUTH: "true",
  DISABLE_RATE_LIMITING: "false",
  ALLOW_TEST_HTTP_SERVER: "false",
  SKIP_DB_LIFECYCLE: "false",
};

const envWith = (nodeEnv: string) =>
  withTestEnv(() => loadEnvOrExit(), {
    overrides: { ...UNSET, ...PRODUCTION_SAFE, NODE_ENV: nodeEnv },
    skipDbLifecycle: false,
  });

describe("defaults that depend on NODE_ENV (log-redaction-coverage D-17)", () => {
  it.each(["production", "Production", "PRODUCTION"])(
    "NODE_ENV=%s gets the production defaults",
    async (nodeEnv) => {
      const env = await envWith(nodeEnv);

      expect(env.NODE_ENV).toBe("production");
      expect(env.DB_SSL_REJECT_UNAUTHORIZED).toBe(true);
      expect(env.LOG_LEVEL).toBe("http");
      expect(env.ENABLE_DUMMY_ENDPOINTS).toBe(false);
      expect(env.EMAIL_PROVIDER).toBe("resend");
      // Production starts with SQL logging off when nothing sets it (D-11).
      expect(env.DB_LOGGING).toBe("false");
    },
  );

  it.each(["test", "Test"])(
    "NODE_ENV=%s gets the test defaults",
    async (nodeEnv) => {
      const env = await envWith(nodeEnv);

      expect(env.NODE_ENV).toBe("test");
      expect(env.REDIS_REQUIRED).toBe(false);
      expect(env.ENABLE_DUMMY_ENDPOINTS).toBe(true);
      expect(env.EMAIL_PROVIDER).toBe("console");
    },
  );

  it("still refuses a NODE_ENV that is not one of the four", async () => {
    await expect(envWith("prod")).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["NODE_ENV"] }),
      ]),
    });
  });
});
