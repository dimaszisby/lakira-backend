import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";

export interface LockoutRedisClient {
  readonly isOpen: boolean;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
}

export type AttemptCounterOptions = {
  /** The Redis key for a subject. Never an address in clear (ADR-0032). */
  keyOf: (subject: string) => string;
  threshold: number;
  ttlSeconds: number;
  /** The 429's message once the threshold is reached. */
  message: string;
  events: { triggered: string; unavailable: string };
  /** What the `triggered` line names the subject by: an id or a hash, never an address. */
  meta: (subject: string) => Record<string, unknown>;
};

export type AttemptCounter = {
  check(subject: string, redis: LockoutRedisClient): Promise<void>;
  /**
   * Counts this attempt before it is judged, and refuses it with 429 once the
   * count passes the threshold. Concurrent attempts each take a number, so at
   * most `threshold` of them are ever judged in one window; a success calls
   * `reset`. Where `check` then `recordFailure` lets parallel guesses all read
   * the same count (credential-changes D-04).
   */
  reserve(subject: string, redis: LockoutRedisClient): Promise<void>;
  recordFailure(subject: string, redis: LockoutRedisClient): Promise<void>;
  reset(subject: string, redis: LockoutRedisClient): Promise<void>;
};

/**
 * Counts failures per subject in a fixed window, and refuses with 429 once the
 * threshold is reached. The Nth failure is still answered as the route answers
 * any failure; the (N+1)th request, and every one after it within the window,
 * gets the 429. Redis being closed or failing lets the request through (fail
 * open), logged. The login lockout (ADR-0032) and the credential counter
 * (credential-changes D-04) are built on it.
 */
export const makeAttemptCounter = (
  options: AttemptCounterOptions,
): AttemptCounter => {
  const logUnavailable = (op: string, err: unknown) => {
    logger.warn(options.events.unavailable, {
      op,
      // The error itself, reduced by the logger (log-and-ci-leaks D-01).
      err,
    });
  };

  return {
    async check(subject, redis) {
      let count = 0;
      try {
        if (!redis.isOpen) return;
        const raw = await redis.get(options.keyOf(subject));
        count = raw ? Number.parseInt(raw, 10) : 0;
      } catch (err) {
        logUnavailable("check", err);
        return;
      }
      if (count >= options.threshold) {
        throw new AppError(options.message, 429);
      }
    },

    async reserve(subject, redis) {
      let count = 0;
      try {
        if (!redis.isOpen) return;
        const key = options.keyOf(subject);
        count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, options.ttlSeconds);
        }
      } catch (err) {
        logUnavailable("reserve", err);
        return;
      }
      if (count > options.threshold) {
        if (count === options.threshold + 1) {
          logger.warn(options.events.triggered, options.meta(subject));
        }
        throw new AppError(options.message, 429);
      }
    },

    async recordFailure(subject, redis) {
      try {
        if (!redis.isOpen) return;
        const key = options.keyOf(subject);
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, options.ttlSeconds);
        }
        if (count === options.threshold) {
          logger.warn(options.events.triggered, options.meta(subject));
        }
      } catch (err) {
        logUnavailable("record", err);
      }
    },

    async reset(subject, redis) {
      try {
        if (!redis.isOpen) return;
        await redis.del(options.keyOf(subject));
      } catch (err) {
        logUnavailable("reset", err);
      }
    },
  };
};
