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

/**
 * The work queues. Named here, beside the routing keys, because a publisher that falls back to
 * running a job in process records it under the job's queue, as the worker does, so the two
 * cannot both run it (queue-failure-paths D-03, ADR-0080).
 */
export const QUEUES = {
  METRIC_LOG_GENERATE_DUMMY: `${APP_SHORT_NAME}.metric-log.generate-dummy`,
  AUTH_SEND_VERIFICATION_EMAIL: `${APP_SHORT_NAME}.auth.send-verification-email`,
  AUTH_SEND_PASSWORD_RESET_EMAIL: `${APP_SHORT_NAME}.auth.send-password-reset-email`,
  AUTH_SEND_INVITE_EMAIL: `${APP_SHORT_NAME}.auth.send-invite-email`,
  PARKING: `${APP_SHORT_NAME}.jobs.parking.queue`,
} as const;

export const ROUTING_KEYS = {
  METRIC_LOG_GENERATE_DUMMY: "metric-log.generate-dummy",
  AUTH_SEND_VERIFICATION_EMAIL: "auth.send-verification-email",
  AUTH_SEND_PASSWORD_RESET_EMAIL: "auth.send-password-reset-email",
  AUTH_SEND_INVITE_EMAIL: "auth.send-invite-email",
} as const;
