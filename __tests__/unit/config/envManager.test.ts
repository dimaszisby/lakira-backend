import { describe, expect, it, beforeEach } from "@jest/globals";
import {
  env as cachedEnv,
  loadEnvOrExit,
  maskEnvValue,
  resetEnvCacheForTesting,
} from "@/config/envManager.js";
import { withTestEnv } from "@/tests/env-test-utils.js";

// These specs ensure the environment bootstrap helpers behave like production.
// Use withTestEnv to avoid mutating the real process.env in CI.

describe("envManager", () => {
  beforeEach(() => {
    resetEnvCacheForTesting();
  });

  it("returns the same cached instance on subsequent calls", async () => {
    await withTestEnv(() => {
      const first = loadEnvOrExit();
      const second = loadEnvOrExit();

      expect(second).toBe(first);
    });
  });

  it("exposes an eagerly loaded env export", () => {
    expect(cachedEnv).toBeDefined();
    expect(cachedEnv.NODE_ENV).toBeDefined();
  });

  it.each([
    ["DB_PASSWORD", "super-secret"],
    ["API_KEY", "abcdef"],
    ["SOME_TOKEN", "token"],
    ["DATABASE_URL", "postgres://user:pass@host/db"],
    // A Sentry DSN is a write credential — anyone holding it can post events
    // into the project. It ends in "DSN", so no other term catches it.
    ["SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/456"],
  ])("masks sensitive %s values", (key, value) => {
    expect(maskEnvValue(key, value)).toBe("***REDACTED***");
  });

  it("leaves non-sensitive keys untouched", () => {
    expect(maskEnvValue("PORT", "8080")).toBe("8080");
  });
});
