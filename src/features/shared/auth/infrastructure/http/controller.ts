import { Request, Response } from "express";
import { env } from "@/config/envManager.js";
import { APP_SHORT_NAME } from "@/config/app-name.js";
import { successResponse } from "@/utils/response-formatter.js";
import catchAsync from "@/utils/catch-async.js";
import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";
import { LOCKOUT_TTL_SECONDS } from "./loginLockout.js";
import { toUserResponseDTO } from "../../infrastructure/mappers/UserMapper.js";
import { buildAuthFeature } from "../../feature.js";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import {
  createUserBody,
  forgotPasswordBody,
  loginUserBody,
  resetPasswordBody,
  updateUserBody,
  verifyEmailBody,
  switchOrgBody,
} from "./schema.zod.js";
import { z } from "zod";

type AuthFeature = ReturnType<typeof buildAuthFeature>;
let feature: AuthFeature = buildAuthFeature();

export const overrideAuthFeatureForTest = (custom: AuthFeature) => {
  feature = custom;
};

const REFRESH_COOKIE_NAME = `${APP_SHORT_NAME}_refresh`;
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";

const setRefreshCookie = (res: Response, rawToken: string) => {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production" || env.NODE_ENV === "staging",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
  });
};

const pickCreateUser = pickValidated(z.object({ body: createUserBody }));
const pickLoginUser = pickValidated(z.object({ body: loginUserBody }));
const pickUpdateUser = pickValidated(z.object({ body: updateUserBody }));
const pickForgotPassword = pickValidated(
  z.object({ body: forgotPasswordBody }),
);
const pickResetPassword = pickValidated(z.object({ body: resetPasswordBody }));
const pickVerifyEmail = pickValidated(z.object({ body: verifyEmailBody }));
const pickSwitchOrg = pickValidated(z.object({ body: switchOrgBody }));

const FORGOT_PASSWORD_RESPONSE =
  "If an account exists for that email, we've sent reset instructions.";
const RESEND_VERIFICATION_RESPONSE =
  "If your email is unverified, we sent a fresh verification link.";

export const register = catchAsync(async (req: Request, res: Response) => {
  const {
    body: { email, username, password, passwordConfirmation, isPublicProfile },
  } = pickCreateUser(req);
  const result = await feature.registerUser.execute({
    email,
    username,
    password,
    passwordConfirmation,
    isPublicProfile,
    userAgent: req.headers["user-agent"] ?? null,
    ip: req.ip ?? null,
  });

  feature.requestEmailVerification
    .execute({ userId: result.user.id, email: result.user.email })
    .catch((err) =>
      logger.error("Failed to send verification email after registration", {
        userId: result.user.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );

  setRefreshCookie(res, result.rawRefreshToken);

  successResponse(
    res,
    201,
    { token: result.token, user: toUserResponseDTO(result.user) },
    "User created successfully",
  );
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const {
    body: { email, password },
  } = pickLoginUser(req);

  try {
    await feature.loginLockout.check(email);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 429) {
      res.setHeader("Retry-After", String(LOCKOUT_TTL_SECONDS));
    }
    throw err;
  }

  let result;
  try {
    result = await feature.loginUser.execute({
      email,
      password,
      userAgent: req.headers["user-agent"] ?? null,
      ip: req.ip ?? null,
    });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) {
      await feature.loginLockout.recordFailedAttempt(email);
    }
    throw err;
  }

  await feature.loginLockout.reset(email);

  setRefreshCookie(res, result.rawRefreshToken);

  successResponse(res, 200, {
    token: result.token,
    user: toUserResponseDTO(result.user),
  });
});

export const getProfile = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const user = await feature.getProfile.execute(req.user.id);
    successResponse(res, 200, toUserResponseDTO(user));
  },
);

export const updateProfile = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { email, username, password, isPublicProfile },
    } = pickUpdateUser(req);
    const updated = await feature.updateProfile.execute({
      userId: req.user.id,
      email,
      username,
      password,
      isPublicProfile,
    });
    successResponse(
      res,
      200,
      { user: toUserResponseDTO(updated) },
      "Profile updated successfully",
    );
  },
);

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (!rawToken) {
    throw new AppError("Unauthorized: No refresh token provided", 401);
  }

  const result = await feature.rotateRefreshToken.execute({
    rawToken,
    userAgent: req.headers["user-agent"] ?? null,
    ip: req.ip ?? null,
  });

  setRefreshCookie(res, result.rawRefreshToken);

  successResponse(res, 200, { token: result.accessToken });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE_NAME];

  if (rawToken) {
    try {
      await feature.revokeRefreshTokenFamily.execute(rawToken);
    } catch (err) {
      logger.warn("auth.logout.revoke_failed", { err });
    }
  }

  clearRefreshCookie(res);
  successResponse(res, 200, null, "Logged out successfully");
});

export const forgotPassword = catchAsync(
  async (req: Request, res: Response) => {
    const {
      body: { email },
    } = pickForgotPassword(req);
    await feature.requestPasswordReset.execute({ email });
    successResponse(res, 200, null, FORGOT_PASSWORD_RESPONSE);
  },
);

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const {
    body: { token, password, passwordConfirmation },
  } = pickResetPassword(req);
  await feature.resetPassword.execute({
    token,
    password,
    passwordConfirmation,
  });
  successResponse(res, 200, null, "Password has been reset. Please log in.");
});

export const verifyEmail = catchAsync(async (req: Request, res: Response) => {
  const {
    body: { token },
  } = pickVerifyEmail(req);
  await feature.verifyEmail.execute({ token });
  successResponse(res, 200, null, "Email verified successfully.");
});

export const resendVerification = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const { id: userId, email } = req.user;
    feature.requestEmailVerification.execute({ userId, email }).catch((err) =>
      logger.error("Failed to resend verification email", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    successResponse(res, 200, null, RESEND_VERIFICATION_RESPONSE);
  },
);

export const switchOrg = catchAsync(async (req: AuthRequest, res: Response) => {
  assertAuthenticated(req);
  const {
    body: { organizationId },
  } = pickSwitchOrg(req);

  const result = await feature.switchOrganization.execute({
    userId: req.user.id,
    organizationId,
    userAgent: req.headers["user-agent"] ?? null,
    ip: req.ip ?? null,
  });

  setRefreshCookie(res, result.rawRefreshToken);

  successResponse(res, 200, { token: result.accessToken });
});
