import {
  buildAuthFeature,
  type AuthFeatureOverrides,
} from "@/features/auth/feature.js";

/**
 * The auth feature as every process runs it (ADR-0056).
 *
 * The HTTP server publishes the verification, password-reset and invite emails
 * and the worker sends them (ADR-0067, ADR-0069, ADR-0070), so both build auth
 * here and run one wiring: the same email sender, repositories and use cases on
 * each side of the queue.
 *
 * Import a feature here through its `feature.ts` or `public.ts` only. `index.ts`
 * exports the router, which loads the HTTP stack into whatever imports this.
 *
 * `overrides` is for what legitimately differs per process: the server passes
 * its message queue, the worker enqueues nothing.
 */
export const buildWiredAuthFeature = (overrides: AuthFeatureOverrides = {}) =>
  buildAuthFeature(overrides);
