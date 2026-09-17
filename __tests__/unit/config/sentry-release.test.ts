import { describe, expect, it, jest } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";

// server.ts calls Sentry.init(...) at module-load time when SENTRY_DSN is set. Mock the
// SDK and reload server.ts fresh (jest.isolateModulesAsync) so the init call runs against
// this test's env overrides, then assert on the call args — no event is ever sent.
jest.mock("@sentry/node", () => ({
  init: jest.fn(),
}));

describe("Sentry.init release (ADR-0039 Part 1)", () => {
  it("receives env.APP_RELEASE", async () => {
    await withTestEnv(
      async () => {
        const Sentry = await import("@sentry/node");
        await jest.isolateModulesAsync(async () => {
          await import("@/server.js");
        });

        expect(Sentry.init).toHaveBeenCalledWith(
          expect.objectContaining({ release: "abc1234" }),
        );
      },
      {
        overrides: {
          SENTRY_DSN: "https://public@example.invalid/1",
          APP_RELEASE: "abc1234",
          ALLOW_TEST_HTTP_SERVER: "false",
        },
      },
    );
  });
});
