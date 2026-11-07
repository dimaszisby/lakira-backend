# withTestEnv Helper Guide

## Purpose

`withTestEnv` (located at `src/tests/env-test-utils.ts`) provides a safe way to override environment variables in Jest tests without leaking state across suites or reinitializing the env cache manually.

## Usage

```ts
import { withTestEnv } from "@/tests/env-test-utils";

describe("example", () => {
  it("overrides env vars", async () => {
    await withTestEnv(
      async () => {
        // test logic that relies on overridden env vars
      },
      { overrides: { FEATURE_FLAG_X: "true" } },
    );
  });
});
```

### Options

- `overrides`: key/value pairs applied to `process.env` for the duration of the callback.
- `skipDbLifecycle` (default `true`): automatically sets `SKIP_DB_LIFECYCLE=true` so unit tests avoid bootstrapping the HTTP server and database.

The helper snapshots existing values, applies overrides, clears the cached env (`resetEnvCacheForTesting()`), and restores everything once the callback finishes.

## Lint Enforcement

All files under `__tests__/` are prevented from touching `process.env` directly via the ESLint `no-restricted-properties` override (enforced January 5 2026). Use `withTestEnv` (or application-level getters such as `getEnv`) to interact with configuration in tests, and run `npm run lint:tests` (or `npx eslint "__tests__/**/*.{ts,js}"`) to verify the guardrail stays green.

## Best Practices

1. Keep overrides as narrow as possible (override only the keys required by the test).
2. Use constants inside the test to assert expected values instead of reading back from `process.env`.
3. For integration tests that genuinely require DB bootstrap, pass `{ skipDbLifecycle: false }` so the helper preserves the original setting.
