import { describe, it, expect } from "@jest/globals";
import { toDomainMetricLibrary } from "@/features/metric/infrastructure/persistence/mappers/MetricReadMapper.js";

/**
 * Issue #314 (audit 2026-11-14 Y20). The list read `MetricSettings`, but the association is
 * aliased `settings` and the query never loaded it, so every metric listed "Not Set".
 */
const row = (extra: object) =>
  ({
    id: "m-1",
    userId: "u-1",
    name: "Steps",
    description: null,
    defaultUnit: "steps",
    isPublic: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  }) as never;

describe("toDomainMetricLibrary's goalType (#314)", () => {
  it("reads the settings the list includes under its alias", () => {
    expect(
      toDomainMetricLibrary(row({ settings: { goalType: "cumulative" } }))
        .goalType,
    ).toBe("cumulative");
  });

  // The model's name is no key the query fills; reading it is what hid the bug.
  it("ignores settings under the model's name", () => {
    expect(
      toDomainMetricLibrary(
        row({ MetricSettings: { goalType: "incremental" } }),
      ).goalType,
    ).toBe("Not Set");
  });

  it.each([
    ["no settings", {}],
    ["settings with no goal type", { settings: { goalType: null } }],
  ])("is Not Set for %s", (_case, extra) => {
    expect(toDomainMetricLibrary(row(extra)).goalType).toBe("Not Set");
  });
});
