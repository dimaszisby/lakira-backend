import { Router } from "express";
import {
  register,
  login,
  getProfile,
  updateProfile,
  logout,
  refresh,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  switchOrg,
} from "./controller.js";
import { authMiddleware } from "./authMiddleware.js";
import {
  passwordResetEmailRateLimiter,
  passwordResetIpRateLimiter,
  userRateLimiter,
  switchOrgRateLimiter,
  emailVerificationEmailRateLimiter,
  emailVerificationIpRateLimiter,
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

export const createAuthRouter = () => {
  const router = Router();

  router.post(
    "/register",
    requireJsonObjectBody(),
    validate(createUserSchema),
    register,
  );
  router.post(
    "/login",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(loginUserSchema),
    login,
  );

  router.get("/profile", authMiddleware, getProfile);
  router.put(
    "/profile",
    userRateLimiter,
    authMiddleware,
    requireJsonObjectBody(),
    validate(updateUserSchema),
    updateProfile,
  );
  router.post("/logout", userRateLimiter, logout);
  router.post("/refresh", userRateLimiter, refresh);

  router.post(
    "/forgot-password",
    passwordResetIpRateLimiter,
    requireJsonObjectBody(),
    validate(forgotPasswordSchema),
    passwordResetEmailRateLimiter,
    forgotPassword,
  );
  router.post(
    "/reset-password",
    passwordResetIpRateLimiter,
    requireJsonObjectBody(),
    validate(resetPasswordSchema),
    resetPassword,
  );

  router.post(
    "/verify-email",
    requireJsonObjectBody(),
    validate(verifyEmailSchema),
    verifyEmail,
  );

  router.post(
    "/resend-verification",
    authMiddleware,
    emailVerificationIpRateLimiter,
    emailVerificationEmailRateLimiter,
    resendVerification,
  );

  router.post(
    "/switch-org",
    switchOrgRateLimiter,
    authMiddleware,
    requireJsonObjectBody(),
    validate(switchOrgSchema),
    switchOrg,
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
