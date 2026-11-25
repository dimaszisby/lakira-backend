import { hashEmail } from "@/utils/email-hash.js";
import {
  makeAttemptCounter,
  type LockoutRedisClient,
} from "./attemptCounter.js";

export type { LockoutRedisClient } from "./attemptCounter.js";

// Semantics: the Nth failed attempt is allowed through (returns 401) and
// causes the counter to reach LOCKOUT_THRESHOLD. The (N+1)th request — and
// every subsequent request within the TTL — is blocked with 429.
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_TTL_SECONDS = 15 * 60;

const loginCounter = makeAttemptCounter({
  keyOf: (email) => `auth:lockout:${hashEmail(email)}`,
  threshold: LOCKOUT_THRESHOLD,
  ttlSeconds: LOCKOUT_TTL_SECONDS,
  message: "Too many failed login attempts. Please try again later.",
  events: {
    triggered: "auth.lockout.triggered",
    unavailable: "auth.lockout.redis_unavailable",
  },
  meta: (email) => ({ emailHash: hashEmail(email) }),
});

export const checkLockout = (
  email: string,
  redis: LockoutRedisClient,
): Promise<void> => loginCounter.check(email, redis);

export const recordFailedAttempt = (
  email: string,
  redis: LockoutRedisClient,
): Promise<void> => loginCounter.recordFailure(email, redis);

export const resetLockout = (
  email: string,
  redis: LockoutRedisClient,
): Promise<void> => loginCounter.reset(email, redis);
