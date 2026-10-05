import { env } from "@/config/envManager.js";
import rateLimit, { type Options } from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Response, NextFunction, type RequestHandler } from "express";
import { redisClient } from "@/utils/redis-client.js";
import { AuthRequest } from "@/types/request.context.js";
import logger from "@/utils/logger.js";
import { hashEmail } from "@/utils/email-hash.js";
import { sendError } from "@/shared/utils/error-envelope.js";

const noopRateLimiter: RequestHandler = (_req, _res, next) => next();
let disableNoticeLogged = false;

const maybeLogDisableNotice = () => {
  if (env.DISABLE_RATE_LIMITING && !disableNoticeLogged) {
    logger.info(
      "[RATE LIMITER] DISABLE_RATE_LIMITING=true — skipping throttling (contract tests / fuzzing runs).",
    );
    disableNoticeLogged = true;
  }
};

/**
 * The one way a limiter answers: log who was throttled, then the shared error
 * envelope — `429 {status: "fail", message}`. express-rate-limit sets the
 * `RateLimit-*` headers before it calls a handler, so they are kept. Every
 * limiter below spreads this into its options; `architecture.test.ts` fails on
 * one that does not (ADR-0057).
 */
const limitExceeded = (
  message: string,
  logLine: (req: AuthRequest) => string,
): Pick<Options, "message" | "handler"> => ({
  message,
  handler: (req: AuthRequest, res: Response, _next: NextFunction, options) => {
    logger.warn(logLine(req));
    sendError(res, options.statusCode, message);
  },
});

const maybeCreateStore = () => {
  if (env.NODE_ENV === "test") return undefined;

  if (!env.REDIS_REQUIRED && !redisClient.isOpen) {
    logger.warn(
      "[RATE LIMITER] Redis not connected; falling back to in-memory store.",
    );
    return undefined;
  }

  return new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  });
};

export const createGlobalRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        store: maybeCreateStore(),
        windowMs: 15 * 60 * 1000,
        max: env.RATE_LIMIT_GLOBAL_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many requests, please try again later.",
          (req) => `Rate limit exceeded for IP: ${req.ip}`,
        ),
      });

export const globalRateLimiter = createGlobalRateLimiter();

export const createUserRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string => {
          return req.user?.id ? `user:${req.user.id}` : req.ip || "anonymous";
        },
        store: maybeCreateStore(),
        windowMs: 15 * 60 * 1000,
        max: env.RATE_LIMIT_USER_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded("Too many requests, please try again later.", (req) =>
          req.user
            ? `Rate limit exceeded for User ID: ${req.user.id}`
            : `Rate limit exceeded for IP: ${req.ip}`,
        ),
      });

export const userRateLimiter = createUserRateLimiter();

export const createAnalyticsRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string => {
          return req.user?.id
            ? `analytics:${req.user.id}`
            : req.ip || "anonymous";
        },
        store: maybeCreateStore(),
        windowMs: 60 * 1000,
        max: env.RATE_LIMIT_ANALYTICS_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many visualization requests, slow down.",
          (req) =>
            `Analytics rate limit exceeded for ${req.user?.id ?? req.ip ?? "anonymous"}`,
        ),
      });

export const analyticsRateLimiter = createAnalyticsRateLimiter();

export const createSwitchOrgRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string => {
          return req.user?.id
            ? `switch-org:${req.user.id}`
            : req.ip || "anonymous";
        },
        store: maybeCreateStore(),
        windowMs: 15 * 60 * 1000,
        max: env.RATE_LIMIT_SWITCH_ORG_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many organization switch requests, please try again later.",
          (req) =>
            `Switch-org rate limit exceeded for ${req.user?.id ?? req.ip ?? "anonymous"}`,
        ),
      });

export const switchOrgRateLimiter = createSwitchOrgRateLimiter();

const normalizeEmailKey = (email: unknown): string | null => {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export const createPasswordResetEmailRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string => {
          const email = normalizeEmailKey(
            (req.body as { email?: unknown } | undefined)?.email,
          );
          return email
            ? `password-reset:email:${email}`
            : `password-reset:ip:${req.ip || "anonymous"}`;
        },
        store: maybeCreateStore(),
        windowMs: 60 * 60 * 1000,
        max: env.RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many password reset requests, please try again later.",
          (req) => {
            const email = normalizeEmailKey(
              (req.body as { email?: unknown } | undefined)?.email,
            );
            // Never the address itself: message text is not redacted.
            return email
              ? `Password reset email rate limit hit for email hash ${hashEmail(email)}`
              : `Password reset email rate limit hit for ${req.ip ?? "anonymous"}`;
          },
        ),
      });

export const passwordResetEmailRateLimiter =
  createPasswordResetEmailRateLimiter();

export const createPasswordResetIpRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string =>
          `password-reset-ip:${req.ip || "anonymous"}`,
        store: maybeCreateStore(),
        windowMs: 60 * 60 * 1000,
        max: env.RATE_LIMIT_PASSWORD_RESET_IP_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many password reset requests, please try again later.",
          (req) => `Password reset IP rate limit hit for ${req.ip}`,
        ),
      });

export const passwordResetIpRateLimiter = createPasswordResetIpRateLimiter();

export const createEmailVerificationEmailRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string => {
          const email =
            typeof req.user?.email === "string" ? req.user.email : null;
          return email
            ? `email-verification:email:${email}`
            : `email-verification:ip:${req.ip || "anonymous"}`;
        },
        store: maybeCreateStore(),
        windowMs: 60 * 60 * 1000,
        max: env.RATE_LIMIT_EMAIL_VERIFICATION_EMAIL_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many verification email requests, please try again later.",
          (req) =>
            req.user?.id
              ? `Email verification email rate limit hit for user ${req.user.id}`
              : `Email verification email rate limit hit for ${req.ip ?? "anonymous"}`,
        ),
      });

export const emailVerificationEmailRateLimiter =
  createEmailVerificationEmailRateLimiter();

export const createEmailVerificationIpRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string =>
          `email-verification-ip:${req.ip || "anonymous"}`,
        store: maybeCreateStore(),
        windowMs: 60 * 60 * 1000,
        max: env.RATE_LIMIT_EMAIL_VERIFICATION_IP_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many verification email requests, please try again later.",
          (req) => `Email verification IP rate limit hit for ${req.ip}`,
        ),
      });

export const emailVerificationIpRateLimiter =
  createEmailVerificationIpRateLimiter();

/**
 * `POST /auth/register` — unauthenticated, and every registration emails the
 * address it is given. Keyed by IP because an attacker chooses the address; one
 * hour, like the other email-sending limiters (ADR-0053, audit R1).
 */
export const createRegisterIpRateLimiter = () =>
  env.DISABLE_RATE_LIMITING
    ? (maybeLogDisableNotice(), noopRateLimiter)
    : rateLimit({
        keyGenerator: (req: AuthRequest): string =>
          `register-ip:${req.ip || "anonymous"}`,
        store: maybeCreateStore(),
        windowMs: 60 * 60 * 1000,
        max: env.RATE_LIMIT_REGISTER_IP_MAX,
        standardHeaders: true,
        legacyHeaders: false,
        ...limitExceeded(
          "Too many registration attempts, please try again later.",
          (req) => `Registration IP rate limit hit for ${req.ip}`,
        ),
      });

export const registerIpRateLimiter = createRegisterIpRateLimiter();
