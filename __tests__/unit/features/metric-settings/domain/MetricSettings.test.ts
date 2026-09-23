import { MetricSettings } from "@/features/metric-settings/domain/entities/MetricSettings.js";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";

const makeSettings = () =>
  MetricSettings.fromPersistence({
    id: "settings-1",
    metricId: "metric-1",
    isActive: true,
    goalEnabled: false,
    goalType: null,
    goalValue: null,
    timeFrameEnabled: false,
    startDate: null,
    deadlineDate: null,
    alertEnabled: false,
    alertThresholds: null,
    isAchieved: false,
    displayOptions: {
      showOnDashboard: true,
      priority: 1,
      chartType: "line",
      color: "#fff",
    },
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  });

describe("MetricSettings entity", () => {
  it("updates details when invariants satisfied", () => {
    const settings = makeSettings();
    settings.updateDetails({
      goalEnabled: true,
      goalType: "cumulative",
      goalValue: 100,
      timeFrameEnabled: true,
      startDate: new Date("2024-05-01T00:00:00Z"),
      deadlineDate: new Date("2024-06-01T00:00:00Z"),
      alertEnabled: true,
      alertThresholds: 80,
    });

    const snapshot = settings.snapshot();
    expect(snapshot.goalEnabled).toBe(true);
    expect(snapshot.goalType).toBe("cumulative");
    expect(snapshot.goalValue).toBe(100);
    expect(snapshot.timeFrameEnabled).toBe(true);
    expect(snapshot.startDate?.toISOString()).toBe("2024-05-01T00:00:00.000Z");
    expect(snapshot.deadlineDate?.toISOString()).toBe(
      "2024-06-01T00:00:00.000Z",
    );
    expect(snapshot.alertEnabled).toBe(true);
    expect(snapshot.alertThresholds).toBe(80);
  });

  it("throws when goal enabled without type/value", () => {
    const settings = makeSettings();
    expect(() =>
      settings.updateDetails({
        goalEnabled: true,
        goalType: null,
        goalValue: null,
      }),
    ).toThrow(ValidationError);
  });

  it("throws when timeframe invalid", () => {
    const settings = makeSettings();
    expect(() =>
      settings.updateDetails({
        timeFrameEnabled: true,
        startDate: new Date("2024-07-01T00:00:00Z"),
        deadlineDate: new Date("2024-06-01T00:00:00Z"),
      }),
    ).toThrow(ValidationError);
  });

  it("throws when alert enabled without thresholds", () => {
    const settings = makeSettings();
    expect(() =>
      settings.updateDetails({ alertEnabled: true, alertThresholds: null }),
    ).toThrow(ValidationError);
  });

  it("resets goal/timeframe/alerts when toggled off", () => {
    const settings = makeSettings();
    settings.updateDetails({
      goalEnabled: false,
      timeFrameEnabled: false,
      alertEnabled: false,
    });
    const snapshot = settings.snapshot();
    expect(snapshot.goalType).toBeNull();
    expect(snapshot.goalValue).toBeNull();
    expect(snapshot.startDate).toBeNull();
    expect(snapshot.deadlineDate).toBeNull();
    expect(snapshot.alertThresholds).toBeNull();
  });

  it("updates display options and marks achievement", () => {
    const settings = makeSettings();
    settings.updateDisplayOptions({
      showOnDashboard: false,
      priority: 5,
      chartType: "bar",
      color: "#000",
    });
    settings.markAchieved();

    const snapshot = settings.snapshot();
    expect(snapshot.displayOptions).toEqual({
      showOnDashboard: false,
      priority: 5,
      chartType: "bar",
      color: "#000",
    });
    expect(snapshot.isAchieved).toBe(true);
  });
});
