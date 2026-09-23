import { jest } from "@jest/globals";
import { GenerateDummyMetricLogs } from "@/features/metric-log/application/use-cases/GenerateDummyMetricLogs.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import { CachePort } from "@/features/metric-log/application/ports/CachePort.js";
import { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { MetricLogRepository } from "@/features/metric-log/domain/repositories/MetricLogRepository.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/infrastructure/queue/topology.js";

const setup = () => {
  const access: jest.Mocked<MetricAccessPort> = {
    ensureMetricOwnership: jest.fn(),
  };
  const cache: jest.Mocked<CachePort> = {
    isEnabled: jest.fn(),
    invalidate: jest.fn(),
  };
  const queue: jest.Mocked<MessageQueuePort> = {
    isEnabled: jest.fn(),
    publish: jest.fn(),
    close: jest.fn(),
  };
  const repo = {
    create: jest.fn(),
  } as unknown as jest.Mocked<MetricLogRepository>;
  const sut = new GenerateDummyMetricLogs(access, cache, queue, repo);
  return { sut, access, cache, queue, repo };
};

const INPUT = {
  userId: "user-1",
  organizationId: "org-1",
  metricId: "metric-1",
  count: 3,
};

describe("GenerateDummyMetricLogs use case", () => {
  beforeEach(() => jest.resetAllMocks());

  describe("queue-enabled path", () => {
    it("publishes a job and returns jobId without inserting DB rows", async () => {
      const { sut, access, cache, queue, repo } = setup();
      queue.isEnabled.mockReturnValue(true);
      queue.publish.mockResolvedValue(undefined);

      const result = await sut.execute(INPUT);

      expect(access.ensureMetricOwnership).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        "metric-1",
      );
      expect(queue.publish).toHaveBeenCalledWith(
        EXCHANGES.JOBS,
        expect.objectContaining({
          jobId: result.jobId,
          userId: "user-1",
          metricId: "metric-1",
          count: 3,
        }),
        expect.objectContaining({
          routingKey: ROUTING_KEYS.METRIC_LOG_GENERATE_DUMMY,
          messageId: result.jobId,
        }),
      );
      expect(repo.create).not.toHaveBeenCalled();
      expect(cache.invalidate).not.toHaveBeenCalled();
      expect(typeof result.jobId).toBe("string");
      expect(result.jobId.length).toBeGreaterThan(0);
    });
  });

  describe("sync fallback path (queue disabled)", () => {
    it("inserts count rows and invalidates cache when cache is enabled", async () => {
      const { sut, cache, queue, repo } = setup();
      queue.isEnabled.mockReturnValue(false);
      cache.isEnabled.mockReturnValue(true);
      repo.create.mockResolvedValue({} as never);

      const result = await sut.execute(INPUT);

      expect(repo.create).toHaveBeenCalledTimes(INPUT.count);
      expect(cache.invalidate).toHaveBeenCalledWith(
        "user-1",
        "org-1",
        "metric-1",
      );
      expect(queue.publish).not.toHaveBeenCalled();
      expect(typeof result.jobId).toBe("string");
    });

    it("inserts rows but skips cache invalidation when cache is disabled", async () => {
      const { sut, cache, queue, repo } = setup();
      queue.isEnabled.mockReturnValue(false);
      cache.isEnabled.mockReturnValue(false);
      repo.create.mockResolvedValue({} as never);

      await sut.execute(INPUT);

      expect(repo.create).toHaveBeenCalledTimes(INPUT.count);
      expect(cache.invalidate).not.toHaveBeenCalled();
    });
  });

  describe("ownership check", () => {
    it("propagates error when ownership check fails", async () => {
      const { sut, access, queue, repo } = setup();
      queue.isEnabled.mockReturnValue(false);
      access.ensureMetricOwnership.mockRejectedValue(new Error("Not owner"));

      await expect(sut.execute(INPUT)).rejects.toThrow("Not owner");
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
