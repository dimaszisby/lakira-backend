import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { validateMetricAccess } from "@/utils/db-helper.js";

// Replace Sequelize models with jest.fn() so we can deterministically drive findOne responses per test.
jest.mock("@/infrastructure/db/models.js", () => ({
  models: {
    Metric: { findOne: jest.fn() },
  },
}));

type FindOneFn = (criteria?: unknown) => Promise<any>;

const {
  models: {
    Metric: { findOne: metricFindOne },
  },
} = jest.requireMock("@/infrastructure/db/models.js") as {
  models: {
    Metric: { findOne: jest.MockedFunction<FindOneFn> };
  };
};

const TEST_ORG_ID = "org-test-id";

describe("db-helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("validateMetricAccess", () => {
    it("throws when userId is missing", async () => {
      await expect(
        validateMetricAccess("", TEST_ORG_ID, "metric-1"),
      ).rejects.toMatchObject({
        message: "User not authenticated",
        kind: "unauthorized",
      });
      expect(metricFindOne).not.toHaveBeenCalled();
    });

    it("throws when metric is not found", async () => {
      metricFindOne.mockResolvedValueOnce(null);

      await expect(
        validateMetricAccess("user-1", TEST_ORG_ID, "metric-1"),
      ).rejects.toMatchObject({
        message: "Metric not found",
        kind: "not_found",
      });
    });

    it("throws when metric is owned by another user", async () => {
      metricFindOne.mockResolvedValueOnce({ id: "metric-1", userId: "user-2" });

      await expect(
        validateMetricAccess("user-1", TEST_ORG_ID, "metric-1"),
      ).rejects.toMatchObject({
        message: "Unauthorized access to metric",
        kind: "forbidden",
      });
    });

    it("returns the metric when ownership matches", async () => {
      const record = { id: "metric-1", userId: "user-1" };
      metricFindOne.mockResolvedValueOnce(record);

      await expect(
        validateMetricAccess("user-1", TEST_ORG_ID, "metric-1"),
      ).resolves.toBe(record);
    });
  });
});
