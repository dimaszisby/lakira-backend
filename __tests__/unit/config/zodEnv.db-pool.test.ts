import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";
import { getEnv } from "@/config/envManager.js";
import { poolOptions } from "@/config/db.js";

/**
 * Issue #239, ADR-0086. The database pool was Sequelize's default of 5 in every
 * process, with no setting; `DB_POOL_MAX` and `DB_POOL_MIN` size it. A value
 * that is not a whole number, a maximum below 1, or a minimum above the
 * maximum is refused at startup, naming the variable.
 *
 * `withTestEnv` parses the environment before it calls the callback, so a
 * refusal rejects the whole call, and it restores what it overrode. Neither
 * .env nor .env.test sets either variable.
 */
const poolWith = (overrides: Record<string, string>) =>
  withTestEnv(() => [getEnv("DB_POOL_MAX"), getEnv("DB_POOL_MIN")], {
    overrides,
  });

const refusalOf = (...paths: string[]) => ({
  issues: expect.arrayContaining(
    paths.map((path) => expect.objectContaining({ path: [path] })),
  ),
});

describe("DB_POOL_MAX and DB_POOL_MIN (#239, ADR-0086)", () => {
  it("default to Sequelize's own 5 and 0, so an unset environment keeps today's pool", async () => {
    await expect(poolWith({})).resolves.toEqual([5, 0]);
  });

  it("accept a pool of 20, kept at no fewer than 2", async () => {
    await expect(
      poolWith({ DB_POOL_MAX: "20", DB_POOL_MIN: "2" }),
    ).resolves.toEqual([20, 2]);
  });

  it("accept a minimum equal to the maximum", async () => {
    await expect(
      poolWith({ DB_POOL_MAX: "4", DB_POOL_MIN: "4" }),
    ).resolves.toEqual([4, 4]);
  });

  it.each([
    ["zero", "0"],
    ["a negative number", "-1"],
    ["a fraction", "2.5"],
    ["text", "abc"],
    ["an empty value", ""],
  ])("refuse a DB_POOL_MAX of %s", async (_label, value) => {
    await expect(poolWith({ DB_POOL_MAX: value })).rejects.toMatchObject(
      refusalOf("DB_POOL_MAX"),
    );
  });

  it.each([
    ["a negative number", "-1"],
    ["a fraction", "0.5"],
    ["text", "abc"],
  ])("refuse a DB_POOL_MIN of %s", async (_label, value) => {
    await expect(poolWith({ DB_POOL_MIN: value })).rejects.toMatchObject(
      refusalOf("DB_POOL_MIN"),
    );
  });

  it("refuse a minimum above the maximum, naming both", async () => {
    const refused = poolWith({ DB_POOL_MAX: "5", DB_POOL_MIN: "10" });

    await expect(refused).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["DB_POOL_MIN"],
          message: expect.stringMatching(
            /DB_POOL_MIN \(10\).*DB_POOL_MAX \(5\)/,
          ),
        }),
      ]),
    });
  });
});

describe("poolOptions", () => {
  it("passes the size it is given, with Sequelize's idle and acquire timeouts", () => {
    expect(poolOptions(20, 2)).toEqual({
      max: 20,
      min: 2,
      idle: 10_000,
      acquire: 60_000,
    });
  });
});
