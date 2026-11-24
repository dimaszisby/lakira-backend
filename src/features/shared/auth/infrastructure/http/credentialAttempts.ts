import { makeAttemptCounter } from "./attemptCounter.js";
import { LOCKOUT_THRESHOLD, LOCKOUT_TTL_SECONDS } from "./loginLockout.js";

/**
 * Wrong current passwords at the credential routes, per user (credential-changes
 * D-04). Apart from the login lockout, so a typo in settings never blocks signing
 * in, and with its numbers, so a script riding a session cannot grind guesses.
 */
export const credentialAttemptCounter = makeAttemptCounter({
  keyOf: (userId) => `auth:credential-attempts:${userId}`,
  threshold: LOCKOUT_THRESHOLD,
  ttlSeconds: LOCKOUT_TTL_SECONDS,
  message: "Too many incorrect passwords. Please try again later.",
  events: {
    triggered: "auth.credentials.attempts_exceeded",
    unavailable: "auth.credentials.redis_unavailable",
  },
  meta: (userId) => ({ userId }),
});

export const CREDENTIAL_ATTEMPTS_TTL_SECONDS = LOCKOUT_TTL_SECONDS;
