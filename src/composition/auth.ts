import {
  buildAuthFeature,
  type AuthFeatureOverrides,
} from "@/features/auth/feature.js";

/**
 * The auth feature as every process runs it (ADR-0056).
 *
 * The HTTP server publishes the verification email and the worker sends it
 * (ADR-0067), so both build auth here and run one wiring: the same email sender,
 * repositories and use case on each side of the queue.
 *
 * Import a feature here through its `feature.ts` or `public.ts` only. `index.ts`
 * exports the router, which loads the HTTP stack into whatever imports this.
 *
 * `overrides` is for what legitimately differs per process: the server passes
 * its message queue, the worker enqueues nothing.
 */
export const buildWiredAuthFeature = (overrides: AuthFeatureOverrides = {}) =>
  buildAuthFeature(overrides);
