import AppError from "@/utils/AppError.js";
import { hashEmail } from "@/utils/email-hash.js";
import logger from "@/utils/logger.js";

// Semantics: the Nth failed attempt is allowed through (returns 401) and
// causes the counter to reach LOCKOUT_THRESHOLD. The (N+1)th request — and
// every subsequent request within the TTL — is blocked with 429.
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_TTL_SECONDS = 15 * 60;

export interface LockoutRedisClient {
  readonly isOpen: boolean;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string | string[]): Promise<unknown>;
}

const keyFor = (email: string): string => `auth:lockout:${hashEmail(email)}`;

const logRedisUnavailable = (op: string, err: unknown) => {
  logger.warn("auth.lockout.redis_unavailable", {
    op,
    err: err instanceof Error ? err.message : String(err),
  });
};

export async function checkLockout(
  email: string,
  redis: LockoutRedisClient,
): Promise<void> {
  let count = 0;
  try {
    if (!redis.isOpen) return;
    const raw = await redis.get(keyFor(email));
    count = raw ? Number.parseInt(raw, 10) : 0;
  } catch (err) {
    logRedisUnavailable("check", err);
    return;
  }
  if (count >= LOCKOUT_THRESHOLD) {
    throw new AppError(
      "Too many failed login attempts. Please try again later.",
      429,
    );
  }
}

export async function recordFailedAttempt(
  email: string,
  redis: LockoutRedisClient,
): Promise<void> {
  try {
    if (!redis.isOpen) return;
    const key = keyFor(email);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, LOCKOUT_TTL_SECONDS);
    }
    if (count === LOCKOUT_THRESHOLD) {
      logger.warn("auth.lockout.triggered", { emailHash: hashEmail(email) });
    }
  } catch (err) {
    logRedisUnavailable("record", err);
  }
}

export async function resetLockout(
  email: string,
  redis: LockoutRedisClient,
): Promise<void> {
  try {
    if (!redis.isOpen) return;
    await redis.del(keyFor(email));
  } catch (err) {
    logRedisUnavailable("reset", err);
  }
}
