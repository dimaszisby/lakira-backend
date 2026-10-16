import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";
import { getEnv } from "@/config/envManager.js";

/**
 * Kit register-rate-limiter, D-05 (register row B-18). Every per-IP limiter keys
 * on req.ip, which Express derives from `trust proxy`. A blank value used to parse
 * as 0, which trusts no proxy and gives every client the edge's address; 1.5
 * trusted two hops. Such a value is now refused at startup.
 *
 * `withTestEnv` parses the environment before it calls the callback, so a refusal
 * rejects the whole call, and it restores what it overrode. Neither .env nor
 * .env.test sets TRUST_PROXY, so with no override it is unset.
 */
const trustProxyWith = (value: string) =>
  withTestEnv(() => getEnv("TRUST_PROXY"), {
    overrides: { TRUST_PROXY: value },
  });

const refusal = {
  issues: expect.arrayContaining([
    expect.objectContaining({ path: ["TRUST_PROXY"] }),
  ]),
};

describe("TRUST_PROXY (register-rate-limiter D-05)", () => {
  it("defaults to one hop when unset", async () => {
    await expect(withTestEnv(() => getEnv("TRUST_PROXY"))).resolves.toBe(1);
  });

  it.each([
    ["0", 0],
    ["1", 1],
    ["2", 2],
    // Coercion accepted surrounding spaces, so a value pasted with one keeps working.
    [" 2 ", 2],
  ])("accepts %p as %i hops", async (value, hops) => {
    await expect(trustProxyWith(value)).resolves.toBe(hops);
  });

  it.each([
    ["an empty value", ""],
    ["a blank value", " "],
    ["a negative number", "-1"],
    ["a fraction", "1.5"],
    ["true", "true"],
    ["a subnet", "10.0.0.0/8"],
    ["trailing text", "1e3x"],
  ])("refuses %s", async (_label, value) => {
    await expect(trustProxyWith(value)).rejects.toMatchObject(refusal);
  });
});
