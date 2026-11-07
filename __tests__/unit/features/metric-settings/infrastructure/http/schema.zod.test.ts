import { describe, expect, it } from "@jest/globals";
import {
  listMetricSettingsViaCursorSchema,
  updateDisplayOptionsSchema,
  settingsBody,
  settingsBodyPartial,
} from "@/features/metric-settings/infrastructure/http/schema.zod.js";

const uuid = "0b57a95f-6c2b-4af2-87a8-47b594edc1d7";

const baseSettings = {
  metricId: uuid,
  goalEnabled: false,
  goalType: "cumulative" as const,
  goalValue: 10,
  timeFrameEnabled: false,
  startDate: null,
  deadlineDate: null,
  alertEnabled: false,
  alertThresholds: 80,
  displayOptions: {
    showOnDashboard: true,
    priority: 1,
    chartType: "line",
    color: "#E897A3",
  },
};

describe("metric-settings schemas", () => {
  it("accepts a valid create payload and applies defaults", () => {
    const parsed = settingsBody.parse({
      ...baseSettings,
      goalEnabled: false,
      timeFrameEnabled: false,
    });

    expect(parsed.metricId).toBe(uuid);
    expect(parsed.displayOptions.showOnDashboard).toBe(true);
    expect(parsed.goalEnabled).toBe(false);
  });

  it("rejects enabling goal without type/value", () => {
    const result = settingsBody.safeParse({
      ...baseSettings,
      goalEnabled: true,
      goalType: null,
      goalValue: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_union",
            path: [],
          }),
        ]),
      );
    }
  });

  it("rejects enabling time frame without both dates", () => {
    const result = settingsBody.safeParse({
      ...baseSettings,
      timeFrameEnabled: true,
      startDate: null,
      deadlineDate: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path.join("."));
      expect(fields).toEqual(
        expect.arrayContaining(["startDate", "deadlineDate"]),
      );
    }
  });

  it("rejects deadlines occurring before the start date", () => {
    const result = settingsBody.safeParse({
      ...baseSettings,
      timeFrameEnabled: true,
      startDate: new Date("2025-01-10"),
      deadlineDate: new Date("2025-01-05"),
    });
    expect(result.success).toBe(false);
  });

  // zod 4 applies a default inside .optional(): an update that left the options out reset
  // them to the defaults (zod-4-migration D-05).
  it("leaves displayOptions out of an update that does not send them", () => {
    const parsed = settingsBodyPartial.parse({ alertEnabled: true });
    expect(parsed).toEqual({ alertEnabled: true });
  });

  it("refuses an empty update, with no default to fill it", () => {
    expect(settingsBodyPartial.safeParse({}).success).toBe(false);
  });

  it("fills the unsent fields of displayOptions an update sends", () => {
    const parsed = settingsBodyPartial.parse({
      displayOptions: { priority: 5 },
    });
    expect(parsed.displayOptions).toEqual({
      showOnDashboard: true,
      priority: 5,
      chartType: "line",
      color: "#E897A3",
    });
  });

  it("requires goal fields when enabling via partial update", () => {
    const result = settingsBodyPartial.safeParse({
      goalEnabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "invalid_union",
            path: [],
          }),
        ]),
      );
    }
  });

  it("transforms list query filters from bracket params", () => {
    const parsed = listMetricSettingsViaCursorSchema.shape.query.parse({
      limit: "50",
      sort: "-updatedAt",
      q: " focus ",
      after: "cursor",
      includeTotal: "true",
      "filter[metricId]": uuid,
      "filter[isActive]": "true",
    });

    expect(parsed.limit).toBe(50);
    expect(parsed.sort).toBe("-updatedAt");
    expect(parsed.q).toBe("focus");
    expect(parsed.filter).toEqual({ metricId: uuid, isActive: true });
  });

  it("validates displayOptions payload for updateDisplayOptionsSchema", () => {
    const ok = updateDisplayOptionsSchema.shape.body.parse({
      displayOptions: {
        showOnDashboard: false,
        priority: 3,
        chartType: "bar",
        color: "#123456",
      },
    });
    expect(ok.displayOptions.priority).toBe(3);

    const result = updateDisplayOptionsSchema.shape.body.safeParse({
      displayOptions: "invalid",
    });
    expect(result.success).toBe(false);
  });

  // Kit query-values-mean-what-they-say, D-02 (register row B-44). z.coerce.boolean is
  // Boolean(value), so "false" and "0" meant true and a client that asked for no total
  // paid for the count. Now as strict as the other three lists.
  describe("includeTotal", () => {
    const includeTotal = (value?: string) =>
      listMetricSettingsViaCursorSchema.shape.query.safeParse(
        value === undefined ? {} : { includeTotal: value },
      );

    it.each([
      ["false", false],
      ["FALSE", false],
      [" false ", false],
      ["true", true],
      ["True", true],
    ])("reads %p as %p", (value, expected) => {
      const parsed = includeTotal(value);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.includeTotal).toBe(expected);
    });

    it("is false when it is not sent", () => {
      const parsed = includeTotal();
      expect(parsed.success && parsed.data.includeTotal).toBe(false);
    });

    it.each(["0", "1", "yes", ""])("refuses %p", (value) => {
      expect(includeTotal(value).success).toBe(false);
    });
  });
});
