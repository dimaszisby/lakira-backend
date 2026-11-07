import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";
import { getEnv } from "@/config/envManager.js";

/**
 * Issue #247, ADR-0089. The rate was `parseFloat` of the value, and 0 when
 * that failed, so 5, -1 and "0.5abc" all started the app and went to
 * `Sentry.init`. A value that is not a number from 0 to 1 is now refused at
 * startup, naming the variable. Blank means 0, as unset does, like SENTRY_DSN.
 */
const rateWith = (value: string | undefined) =>
  withTestEnv(() => getEnv("SENTRY_TRACES_SAMPLE_RATE"), {
    overrides: { SENTRY_TRACES_SAMPLE_RATE: value },
  });

describe("SENTRY_TRACES_SAMPLE_RATE (#247, ADR-0089)", () => {
  it.each([
    ["unset", undefined, 0],
    ["blank", "", 0],
    ["0", "0", 0],
    ["1", "1", 1],
    ["a value between", "0.25", 0.25],
    ["1.0", "1.0", 1],
  ])("reads %s", async (_label, value, rate) => {
    await expect(rateWith(value)).resolves.toBe(rate);
  });

  it.each([
    ["above 1", "1.5"],
    ["below 0", "-1"],
    ["trailing junk", "0.5abc"],
    ["text", "abc"],
  ])("refuses a value %s, naming the variable", async (_label, value) => {
    await expect(rateWith(value)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["SENTRY_TRACES_SAMPLE_RATE"],
          message: expect.stringMatching(
            /^SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1/,
          ),
        }),
      ]),
    });
  });
});
