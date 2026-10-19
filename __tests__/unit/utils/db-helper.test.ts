import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  validateMetricAccess,
  validateMetricCategoryAccess,
  findOwnedMetric,
  findOwnedCategory,
  findOwnedMetricSettings,
  findOwnedMetricLog,
} from "@/utils/db-helper.js";

// Replace Sequelize models with jest.fn() so we can deterministically drive findOne responses per test.
jest.mock("@/infrastructure/db/models.js", () => ({
  models: {
    Metric: { findOne: jest.fn() },
    MetricCategory: { findOne: jest.fn() },
    MetricSettings: { findOne: jest.fn() },
    MetricLog: { findOne: jest.fn() },
  },
}));

type FindOneFn = (criteria?: unknown) => Promise<any>;

const {
  models: {
    Metric: { findOne: metricFindOne },
    MetricCategory: { findOne: metricCategoryFindOne },
    MetricSettings: { findOne: metricSettingsFindOne },
    MetricLog: { findOne: metricLogFindOne },
  },
} = jest.requireMock("@/infrastructure/db/models.js") as {
  models: {
    Metric: { findOne: jest.MockedFunction<FindOneFn> };
    MetricCategory: { findOne: jest.MockedFunction<FindOneFn> };
    MetricSettings: { findOne: jest.MockedFunction<FindOneFn> };
    MetricLog: { findOne: jest.MockedFunction<FindOneFn> };
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

  describe("validateMetricCategoryAccess", () => {
    it("throws when category does not exist", async () => {
      metricCategoryFindOne.mockResolvedValueOnce(null);

      await expect(
        validateMetricCategoryAccess("user-1", TEST_ORG_ID, "category-1"),
      ).rejects.toMatchObject({
        message: "Metric Category not found",
        statusCode: 404,
      });
    });

    it("throws when another user owns the category", async () => {
      metricCategoryFindOne.mockResolvedValueOnce({
        id: "category-1",
        userId: "user-2",
      });

      await expect(
        validateMetricCategoryAccess("user-1", TEST_ORG_ID, "category-1"),
      ).rejects.toMatchObject({
        message: "Unauthorized access to metric category",
        statusCode: 403,
      });
    });

    it("returns the category when ownership matches", async () => {
      const record = { id: "category-1", userId: "user-1" };
      metricCategoryFindOne.mockResolvedValueOnce(record);

      await expect(
        validateMetricCategoryAccess("user-1", TEST_ORG_ID, "category-1"),
      ).resolves.toBe(record);
    });
  });

  describe("findOwnedMetric", () => {
    it("returns the owned metric after validation", async () => {
      const validationRecord = { id: "metric-1", userId: "user-1" };
      const metricRecord = { id: "metric-1", userId: "user-1", name: "OKR" };
      metricFindOne
        .mockResolvedValueOnce(validationRecord)
        .mockResolvedValueOnce(metricRecord);

      await expect(
        findOwnedMetric("user-1", TEST_ORG_ID, "metric-1"),
      ).resolves.toBe(metricRecord);

      expect(metricFindOne).toHaveBeenNthCalledWith(1, {
        where: { id: "metric-1", organizationId: TEST_ORG_ID },
        attributes: ["id", "userId", "organizationId"],
      });
      expect(metricFindOne).toHaveBeenNthCalledWith(2, {
        where: {
          id: "metric-1",
          userId: "user-1",
          organizationId: TEST_ORG_ID,
        },
      });
    });

    it("throws when metric lookup returns null", async () => {
      const validationRecord = { id: "metric-1", userId: "user-1" };
      metricFindOne
        .mockResolvedValueOnce(validationRecord)
        .mockResolvedValueOnce(null);

      await expect(
        findOwnedMetric("user-1", TEST_ORG_ID, "metric-1"),
      ).rejects.toMatchObject({
        message: "Metric not found",
        statusCode: 404,
      });
    });
  });

  describe("findOwnedCategory", () => {
    it("returns the owned category after validation", async () => {
      const validationRecord = { id: "category-1", userId: "user-1" };
      const categoryRecord = {
        id: "category-1",
        userId: "user-1",
        title: "Fitness",
      };
      metricCategoryFindOne
        .mockResolvedValueOnce(validationRecord)
        .mockResolvedValueOnce(categoryRecord);

      await expect(
        findOwnedCategory("user-1", TEST_ORG_ID, "category-1"),
      ).resolves.toBe(categoryRecord);

      expect(metricCategoryFindOne).toHaveBeenNthCalledWith(2, {
        where: {
          id: "category-1",
          userId: "user-1",
          organizationId: TEST_ORG_ID,
        },
      });
    });

    it("throws when category lookup returns null", async () => {
      const validationRecord = { id: "category-1", userId: "user-1" };
      metricCategoryFindOne
        .mockResolvedValueOnce(validationRecord)
        .mockResolvedValueOnce(null);

      await expect(
        findOwnedCategory("user-1", TEST_ORG_ID, "category-1"),
      ).rejects.toMatchObject({
        message: "Category not found",
        statusCode: 404,
      });
    });
  });

  describe("findOwnedMetricSettings", () => {
    it("returns settings when user owns the related metric", async () => {
      const settingsRecord = {
        id: "settings-1",
        metric: { id: "metric-1", userId: "user-1" },
      };
      metricSettingsFindOne.mockResolvedValueOnce(settingsRecord);

      await expect(
        findOwnedMetricSettings("user-1", TEST_ORG_ID, "settings-1"),
      ).resolves.toBe(settingsRecord);

      expect(metricSettingsFindOne).toHaveBeenCalledWith({
        where: { id: "settings-1", organizationId: TEST_ORG_ID },
        include: [
          {
            model: expect.anything(),
            as: "metric",
            attributes: ["id", "userId", "isPublic"],
            where: { userId: "user-1", organizationId: TEST_ORG_ID },
          },
        ],
      });
    });

    it("throws when settings lookup fails", async () => {
      metricSettingsFindOne.mockResolvedValueOnce(null);

      await expect(
        findOwnedMetricSettings("user-1", TEST_ORG_ID, "settings-1"),
      ).rejects.toMatchObject({
        message: "Metric Settings not found",
        statusCode: 404,
      });
    });

    it("throws when metric ownership mismatch occurs", async () => {
      // The updated implementation uses an INNER JOIN scoped to { userId, organizationId }
      // so a userId mismatch causes findOne to return null (join excludes the row),
      // resulting in a 404 rather than a 403.
      metricSettingsFindOne.mockResolvedValueOnce(null);

      await expect(
        findOwnedMetricSettings("user-1", TEST_ORG_ID, "settings-1"),
      ).rejects.toMatchObject({
        message: "Metric Settings not found",
        statusCode: 404,
      });
    });
  });

  describe("findOwnedMetricLog", () => {
    it("returns log when user owns the related metric", async () => {
      const logRecord = {
        id: "log-1",
        metric: { id: "metric-1", userId: "user-1" },
      };
      metricLogFindOne.mockResolvedValueOnce(logRecord);

      await expect(
        findOwnedMetricLog("user-1", TEST_ORG_ID, "log-1"),
      ).resolves.toBe(logRecord);
    });

    it("throws when log lookup fails", async () => {
      metricLogFindOne.mockResolvedValueOnce(null);

      await expect(
        findOwnedMetricLog("user-1", TEST_ORG_ID, "log-1"),
      ).rejects.toMatchObject({
        message: "Metric Log not found",
        statusCode: 404,
      });
    });

    it("throws when metric ownership mismatch occurs", async () => {
      // The updated implementation uses an INNER JOIN scoped to { userId, organizationId }
      // so a userId mismatch causes findOne to return null (join excludes the row),
      // resulting in a 404 rather than a 403.
      metricLogFindOne.mockResolvedValueOnce(null);

      await expect(
        findOwnedMetricLog("user-1", TEST_ORG_ID, "log-1"),
      ).rejects.toMatchObject({
        message: "Metric Log not found",
        statusCode: 404,
      });
    });
  });
});
