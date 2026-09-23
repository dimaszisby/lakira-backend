import { MetricLogRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogRepoSequelize.js";
import { MetricLogCacheRedis } from "./infrastructure/cache/MetricLogCacheRedis.js";
import { MetricAccessSequelize } from "@/features/metric/public.js";
import { CreateMetricLog } from "./application/use-cases/CreateMetricLog.js";
import { GetMetricLog } from "./application/queries/GetMetricLog.js";
import { UpdateMetricLog } from "./application/use-cases/UpdateMetricLog.js";
import { DeleteMetricLog } from "./application/use-cases/DeleteMetricLog.js";
import { GetMetricLogStats } from "./application/queries/GetMetricLogStats.js";
import { GenerateDummyMetricLogs } from "./application/use-cases/GenerateDummyMetricLogs.js";
import { MetricLogQueryRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogQueryRepoSequelize.js";
import { MetricLogStatsRepoSequelize } from "./infrastructure/persistence/repositories/MetricLogStatsRepoSequelize.js";
import { ListMetricLogs } from "./application/queries/ListMetricLogs.js";
import type { VisualizationInvalidationPort } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import { NoopVisualizationInvalidation } from "@/shared/application/ports/VisualizationInvalidationPort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import { NoopMessageQueue } from "@/shared/infrastructure/queue/NoopMessageQueue.js";
import type { MetricAccessPort } from "@/features/public/metric/application/ports/MetricAccessPort.js";
import type { MetricLogStatsPort } from "./application/ports/MetricLogStatsPort.js";

export type MetricLogFeatureOverrides = {
  visualizationInvalidator?: VisualizationInvalidationPort;
  messageQueue?: MessageQueuePort;
  metricAccess?: MetricAccessPort;
  statsRepo?: MetricLogStatsPort;
};

export const buildMetricLogFeature = (deps: MetricLogFeatureOverrides = {}) => {
  const repo = new MetricLogRepoSequelize();
  const visualizationInvalidator =
    deps.visualizationInvalidator ?? new NoopVisualizationInvalidation();
  const cache = new MetricLogCacheRedis(visualizationInvalidator);
  const access = deps.metricAccess ?? new MetricAccessSequelize();
  const queue = deps.messageQueue ?? new NoopMessageQueue();
  const queryRepo = new MetricLogQueryRepoSequelize();
  const statsRepo = deps.statsRepo ?? new MetricLogStatsRepoSequelize();

  return {
    createLog: new CreateMetricLog(repo, access, cache),
    getLog: new GetMetricLog(repo),
    updateLog: new UpdateMetricLog(repo, cache),
    deleteLog: new DeleteMetricLog(repo, cache),
    getStats: new GetMetricLogStats(access, statsRepo),
    generateDummyLogs: new GenerateDummyMetricLogs(access, cache, queue, repo),
    listLogs: new ListMetricLogs(queryRepo),
  };
};
