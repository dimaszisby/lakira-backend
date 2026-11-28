import { describe, expect, it, jest } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";
import type { InitSentryOptions } from "@/utils/sentry-init.js";

// initSentry is the one Sentry.init, called by the server and the worker (ADR-0103). Mock the
// SDK and load the module fresh under each env, so no event is ever sent.
jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  onUnhandledRejectionIntegration: jest.fn((options: unknown) => ({
    name: "OnUnhandledRejection",
    options,
  })),
}));

type Named = { name: string; options?: unknown };

const callInit = async (
  dsn: string,
  options: InitSentryOptions,
): Promise<jest.Mock> => {
  let init: jest.Mock = jest.fn();
  await withTestEnv(
    async () => {
      const Sentry = await import("@sentry/node");
      init = Sentry.init as unknown as jest.Mock;
      init.mockClear();
      await jest.isolateModulesAsync(async () => {
        const { initSentry } = await import("@/utils/sentry-init.js");
        initSentry(options);
      });
    },
    { overrides: { SENTRY_DSN: dsn, APP_RELEASE: "abc1234" } },
  );
  return init;
};

const DSN = "https://public@example.invalid/1";
const DEFAULTS: Named[] = [
  { name: "Dedupe" },
  { name: "OnUnhandledRejection" },
  { name: "Http" },
];

const optionsOf = (init: jest.Mock) =>
  init.mock.calls[0]![0] as Record<string, unknown> & {
    integrations: (defaults: Named[]) => Named[];
  };

describe("initSentry (#313, ADR-0103)", () => {
  it("starts nothing without a DSN", async () => {
    const init = await callInit("", { processName: "worker" });
    expect(init).not.toHaveBeenCalled();
  });

  it("starts Sentry with the shared settings and scrub hooks, tagged with its process", async () => {
    const init = await callInit(DSN, { processName: "worker" });
    const { SENTRY_DATA_COLLECTION, SENTRY_SCRUB_HOOKS } =
      await import("@/utils/sentry-scrub.js");

    expect(init).toHaveBeenCalledTimes(1);
    const options = optionsOf(init);
    expect(options).toMatchObject({
      dsn: DSN,
      release: "abc1234",
      traceLifecycle: "stream",
      attachStacktrace: false,
      dataCollection: SENTRY_DATA_COLLECTION,
      initialScope: { tags: { process: "worker" } },
    });
    for (const hook of Object.keys(SENTRY_SCRUB_HOOKS)) {
      expect(typeof options[hook]).toBe("function");
    }
  });

  // Review M3: the default "warn" mode printed a rejection's raw stack past the logger.
  it("replaces the unhandled-rejection integration with one that prints nothing, and appends the caller's", async () => {
    const express = { name: "Express" };
    const init = await callInit(DSN, {
      processName: "api",
      integrations: [express as never],
    });
    expect(optionsOf(init).integrations(DEFAULTS)).toEqual([
      { name: "Dedupe" },
      { name: "Http" },
      { name: "OnUnhandledRejection", options: { mode: "none" } },
      express,
    ]);
  });

  // Review M4: Dedupe dropped a park identical to the one before it.
  it("leaves Dedupe out when told to", async () => {
    const init = await callInit(DSN, { processName: "worker", dedupe: false });
    const names = optionsOf(init)
      .integrations(DEFAULTS)
      .map(({ name }) => name);
    expect(names).toEqual(["Http", "OnUnhandledRejection"]);
  });
});
