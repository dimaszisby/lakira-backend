import { Router } from "express";
import { createAuthController } from "./controller.js";
import type { AuthFeature } from "../../feature.js";
import { authMiddleware } from "./authMiddleware.js";
import {
  passwordResetEmailRateLimiter,
  passwordResetIpRateLimiter,
  userRateLimiter,
  switchOrgRateLimiter,
  emailVerificationEmailRateLimiter,
  emailVerificationIpRateLimiter,
  registerIpRateLimiter,
  loginRateLimiter,
  authSessionRateLimiter,
} from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createUserSchema,
  forgotPasswordSchema,
  loginUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  verifyEmailSchema,
  switchOrgSchema,
} from "./schema.zod.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

export const createAuthRouter = (feature: AuthFeature) => {
  const controller = createAuthController(feature);
  const router = Router();

  router.post(
    "/register",
    registerIpRateLimiter,
    requireJsonObjectBody(),
    validate(createUserSchema),
    controller.register,
  );
  router.post(
    "/login",
    loginRateLimiter,
    requireJsonObjectBody(),
    validate(loginUserSchema),
    controller.login,
  );

  router.get("/profile", authMiddleware, controller.getProfile);
  router.put(
    "/profile",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(updateUserSchema),
    controller.updateProfile,
  );
  // Neither has a user to key on: limited by address, apart from login's budget
  // (api-tooling-residuals D-08).
  router.post("/logout", authSessionRateLimiter, controller.logout);
  router.post("/refresh", authSessionRateLimiter, controller.refresh);

  router.post(
    "/forgot-password",
    passwordResetIpRateLimiter,
    requireJsonObjectBody(),
    validate(forgotPasswordSchema),
    passwordResetEmailRateLimiter,
    controller.forgotPassword,
  );
  router.post(
    "/reset-password",
    passwordResetIpRateLimiter,
    requireJsonObjectBody(),
    validate(resetPasswordSchema),
    controller.resetPassword,
  );

  router.post(
    "/verify-email",
    emailVerificationIpRateLimiter,
    requireJsonObjectBody(),
    validate(verifyEmailSchema),
    controller.verifyEmail,
  );

  router.post(
    "/resend-verification",
    authMiddleware,
    emailVerificationIpRateLimiter,
    emailVerificationEmailRateLimiter,
    controller.resendVerification,
  );

  router.post(
    "/switch-org",
    authMiddleware,
    switchOrgRateLimiter,
    requireJsonObjectBody(),
    validate(switchOrgSchema),
    controller.switchOrg,
  );

  router.all("/register", methodNotAllowed(["POST"]));
  router.all("/login", methodNotAllowed(["POST"]));
  router.all("/profile", methodNotAllowed(["GET", "PUT"]));
  router.all("/logout", methodNotAllowed(["POST"]));
  router.all("/refresh", methodNotAllowed(["POST"]));
  router.all("/forgot-password", methodNotAllowed(["POST"]));
  router.all("/reset-password", methodNotAllowed(["POST"]));
  router.all("/verify-email", methodNotAllowed(["POST"]));
  router.all("/resend-verification", methodNotAllowed(["POST"]));
  router.all("/switch-org", methodNotAllowed(["POST"]));

  return router;
};
