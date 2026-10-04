import { APP_SHORT_NAME } from "@/config/app-name.js";

/**
 * The exchange and routing-key names a publisher passes to
 * `MessageQueuePort.publish`. They are that port's vocabulary, so they live beside
 * it; the code that declares them on a broker channel stays in
 * `src/shared/infrastructure/queue/topology.ts`, which re-exports these (ADR-0058).
 */
export const EXCHANGES = {
  JOBS: `${APP_SHORT_NAME}.jobs`,
  PARKING: `${APP_SHORT_NAME}.jobs.parking`,
} as const;

export const ROUTING_KEYS = {
  METRIC_LOG_GENERATE_DUMMY: "metric-log.generate-dummy",
} as const;
