import { describe, expect, it, jest } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";

// server.ts calls Sentry.init(...) at module-load time when SENTRY_DSN is set. Mock the
// SDK and reload server.ts fresh (jest.isolateModulesAsync) so the init call runs against
// this test's env overrides, then assert on the call args — no event is ever sent.
jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  expressIntegration: jest.fn((options: unknown) => ({
    name: "Express",
    options,
  })),
}));

const initOptions = async (): Promise<Record<string, unknown>> => {
  let options: Record<string, unknown> = {};
  await withTestEnv(
    async () => {
      const Sentry = await import("@sentry/node");
      (Sentry.init as jest.Mock).mockClear();
      await jest.isolateModulesAsync(async () => {
        await import("@/server.js");
      });
      expect(Sentry.init).toHaveBeenCalledTimes(1);
      options = (Sentry.init as jest.Mock).mock.calls[0][0] as Record<
        string,
        unknown
      >;
    },
    {
      overrides: {
        SENTRY_DSN: "https://public@example.invalid/1",
        APP_RELEASE: "abc1234",
        ALLOW_TEST_HTTP_SERVER: "false",
      },
    },
  );
  return options;
};

describe("Sentry.init release (ADR-0039 Part 1)", () => {
  it("receives env.APP_RELEASE", async () => {
    expect(await initOptions()).toEqual(
      expect.objectContaining({ release: "abc1234" }),
    );
  });
});

// Sentry 11 collects every data category it is not told to leave alone (ADR-0071).
describe("Sentry.init on 11 (sentry-11-data-collection)", () => {
  it("names every data category, each off (D-02)", async () => {
    expect((await initOptions()).dataCollection).toStrictEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 5,
    });
  });

  it("pins streamed spans, keeps 10's stack trace setting, and every scrub hook", async () => {
    const options = await initOptions();

    expect(options.traceLifecycle).toBe("stream");
    expect(options.attachStacktrace).toBe(false);
    expect(Object.keys(options)).toEqual(
      expect.arrayContaining(["beforeSend", "beforeSendSpan", "beforeSendLog"]),
    );
    expect(options).not.toHaveProperty("sendDefaultPii");
  });

  it("leaves capturing a server error to errorHandler (D-04)", async () => {
    expect((await initOptions()).integrations).toEqual([
      { name: "Express", options: { shouldHandleError: false } },
    ]);
  });
});
