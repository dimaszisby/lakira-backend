import { describe, it, expect } from "@jest/globals";
import { logCountOf } from "@/features/metric/infrastructure/persistence/mappers/MetricReadMapper.js";

/**
 * Issue #251. A list query computes `logCount`, and a Sequelize row holds a
 * computed column only in its dataValues, behind `get`. Read as a property it
 * was undefined, so every metric listed with 0.
 */
describe("logCountOf (#251)", () => {
  it("reads a Sequelize row's computed column through get", () => {
    const row = {
      logCount: undefined,
      get: (key: string) => (key === "logCount" ? "2" : undefined),
    };

    expect(logCountOf(row)).toBe(2);
  });

  it("reads a plain object's property", () => {
    expect(logCountOf({ logCount: 3 })).toBe(3);
  });

  it("is 0 when there is none", () => {
    expect(logCountOf({})).toBe(0);
  });
});
