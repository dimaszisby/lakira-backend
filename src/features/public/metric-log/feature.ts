import { MetricLogRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogRepoSequelize.js";
import { MetricLogCacheRedis } from "./infrastructure/cache/MetricLogCacheRedis.js";
import { CreateMetricLog } from "./application/use-cases/CreateMetricLog.js";
import { GetMetricLog } from "./application/queries/GetMetricLog.js";
import { UpdateMetricLog } from "./application/use-cases/UpdateMetricLog.js";
import { DeleteMetricLog } from "./application/use-cases/DeleteMetricLog.js";
import { GetMetricLogStats } from "./application/queries/GetMetricLogStats.js";
import { GenerateDummyMetricLogs } from "./application/use-cases/GenerateDummyMetricLogs.js";
import { GenerateDummyMetricLogsHandler } from "./application/use-cases/GenerateDummyMetricLogsHandler.js";
import { MetricLogQueryRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogQueryRepoSequelize.js";
import { MetricLogStatsRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogStatsRepoSequelize.js";
import { ListMetricLogs } from "./application/queries/ListMetricLogs.js";
import type { VisualizationInvalidationPort } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import { NoopVisualizationInvalidation } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import { NoopMessageQueue } from "@/shared/infrastructure/queue/NoopMessageQueue.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import { SequelizeMessageIdempotency } from "@/shared/infrastructure/queue/SequelizeMessageIdempotency.js";
import type { MetricAccessPort } from "./application/ports/MetricAccessPort.js";
import type { MetricLogStatsPort } from "./application/ports/MetricLogStatsPort.js";

/** What src/composition/ supplies: another feature's adapter (metric-access-wiring D-01, D-03). */
export type MetricLogFeatureDeps = {
  metricAccess: MetricAccessPort;
};

export type MetricLogFeatureOverrides = {
  visualizationInvalidator?: VisualizationInvalidationPort;
  messageQueue?: MessageQueuePort;
  statsRepo?: MetricLogStatsPort;
  idempotency?: MessageIdempotencyPort;
};

export const buildMetricLogFeature = (
  { metricAccess: access }: MetricLogFeatureDeps,
  overrides: MetricLogFeatureOverrides = {},
) => {
  const repo = new MetricLogRepoSequelize();
  const visualizationInvalidator =
    overrides.visualizationInvalidator ?? new NoopVisualizationInvalidation();
  const cache = new MetricLogCacheRedis(visualizationInvalidator);
  const queue = overrides.messageQueue ?? new NoopMessageQueue();
  const queryRepo = new MetricLogQueryRepoSequelize();
  const statsRepo = overrides.statsRepo ?? new MetricLogStatsRepoSequelize();
  const idempotency =
    overrides.idempotency ?? new SequelizeMessageIdempotency();

  return {
    createLog: new CreateMetricLog(repo, access, cache),
    getLog: new GetMetricLog(repo),
    updateLog: new UpdateMetricLog(repo, cache),
    deleteLog: new DeleteMetricLog(repo, cache),
    getStats: new GetMetricLogStats(access, statsRepo),
    generateDummyLogs: new GenerateDummyMetricLogs(access, cache, queue, repo),
    listLogs: new ListMetricLogs(queryRepo),
    // The queue side of generateDummyLogs. Built here, from the same cache and
    // repository, so the worker cannot wire it differently (ADR-0056).
    dummyLogsHandler: new GenerateDummyMetricLogsHandler(
      access,
      cache,
      idempotency,
      repo,
    ),
  };
};

/** What `buildMetricLogFeature` builds: the type a router and its controller are handed (ADR-0072). */
export type MetricLogFeature = ReturnType<typeof buildMetricLogFeature>;
