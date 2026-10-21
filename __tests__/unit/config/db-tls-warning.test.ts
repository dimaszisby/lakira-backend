import { describe, it, expect, jest } from "@jest/globals";
import { sslOptions, warnWhenTlsUnverified } from "@/config/db.js";

/**
 * Kit database-tls-and-staging-refusals, D-01. Staging may turn verification of
 * the database certificate off, and says so at every start; production refuses
 * it at the schema, so it never reaches here.
 */
describe("warnWhenTlsUnverified", () => {
  it("warns in staging when verification is off, naming the variable", () => {
    const warn = jest.fn<(message: string) => void>();

    expect(warnWhenTlsUnverified("staging", false, warn)).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("DB_SSL_REJECT_UNAUTHORIZED");
  });

  it.each([
    ["staging", true],
    ["development", false],
    ["test", false],
  ] as const)("stays quiet when NODE_ENV=%s and it is %s", (nodeEnv, value) => {
    const warn = jest.fn<(message: string) => void>();

    expect(warnWhenTlsUnverified(nodeEnv, value, warn)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});

// Kit database-tls-and-staging-refusals, D-04.
describe("sslOptions", () => {
  it("trusts the CA it is given", () => {
    expect(sslOptions(true, "PEM")).toEqual({
      require: true,
      rejectUnauthorized: true,
      ca: "PEM",
    });
  });

  it("leaves the default bundle alone without one", () => {
    expect(sslOptions(true, undefined)).toEqual({
      require: true,
      rejectUnauthorized: true,
    });
  });
});
