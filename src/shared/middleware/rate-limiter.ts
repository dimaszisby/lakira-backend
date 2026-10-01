import { env } from "@/config/envManager.js";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Response, NextFunction, type RequestHandler } from "express";
import { redisClient } from "@/utils/redis-client.js";
import { AuthRequest } from "@/types/request.context.js";
import logger from "@/utils/logger.js";

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
        message: {
          status: 429,
          message: "Too many requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message: "Too many requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          if (req.user) {
            logger.warn(`Rate limit exceeded for User ID: ${req.user.id}`);
          } else {
            logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
          }
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message: "Too many visualization requests, slow down.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          const identifier = req.user?.id ?? req.ip ?? "anonymous";
          logger.warn(`Analytics rate limit exceeded for ${identifier}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message:
            "Too many organization switch requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          const identifier = req.user?.id ?? req.ip ?? "anonymous";
          logger.warn(`Switch-org rate limit exceeded for ${identifier}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message: "Too many password reset requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          const email = normalizeEmailKey(
            (req.body as { email?: unknown } | undefined)?.email,
          );
          logger.warn(
            `Password reset email rate limit hit for ${email ?? req.ip}`,
          );
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message: "Too many password reset requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          logger.warn(`Password reset IP rate limit hit for ${req.ip}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message:
            "Too many verification email requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          const email = req.user?.email ?? req.ip;
          logger.warn(`Email verification email rate limit hit for ${email}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message:
            "Too many verification email requests, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          logger.warn(`Email verification IP rate limit hit for ${req.ip}`);
          res.status(options.statusCode).json(options.message);
        },
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
        message: {
          status: 429,
          message: "Too many registration attempts, please try again later.",
        },
        handler: (
          req: AuthRequest,
          res: Response,
          next: NextFunction,
          options,
        ) => {
          logger.warn(`Registration IP rate limit hit for ${req.ip}`);
          res.status(options.statusCode).json(options.message);
        },
      });

export const registerIpRateLimiter = createRegisterIpRateLimiter();
