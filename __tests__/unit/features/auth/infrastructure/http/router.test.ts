import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { createAuthRouter } from "@/features/auth/infrastructure/http/router.js";

type RouterDouble = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  all: jest.Mock;
  use: jest.Mock;
};

jest.mock("express", () => ({
  Router: jest.fn(
    (): RouterDouble => ({
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      all: jest.fn(),
      use: jest.fn(),
    }),
  ),
}));

const { Router: RouterMock } = jest.requireMock("express") as {
  Router: jest.Mock;
};

// Named sentinels so the assertion reads as the chain it checks.
jest.mock("@/shared/middleware/rate-limiter.js", () => ({
  registerIpRateLimiter: "registerIpRateLimiter",
  userRateLimiter: "userRateLimiter",
  passwordResetEmailRateLimiter: "passwordResetEmailRateLimiter",
  passwordResetIpRateLimiter: "passwordResetIpRateLimiter",
  switchOrgRateLimiter: "switchOrgRateLimiter",
  emailVerificationEmailRateLimiter: "emailVerificationEmailRateLimiter",
  emailVerificationIpRateLimiter: "emailVerificationIpRateLimiter",
}));

jest.mock("@/shared/middleware/require-json-object.js", () => ({
  requireJsonObjectBody: jest.fn(() => "requireJsonObjectBody"),
}));

jest.mock("@/shared/middleware/validation.js", () => ({
  validate: jest.fn(() => "validate"),
}));

jest.mock("@/features/auth/infrastructure/http/authMiddleware.js", () => ({
  authMiddleware: "authMiddleware",
}));

jest.mock("@/features/auth/infrastructure/http/controller.js", () => ({
  register: "register",
  login: "login",
  getProfile: "getProfile",
  updateProfile: "updateProfile",
  logout: "logout",
  refresh: "refresh",
  forgotPassword: "forgotPassword",
  resetPassword: "resetPassword",
  verifyEmail: "verifyEmail",
  resendVerification: "resendVerification",
  switchOrg: "switchOrg",
}));

const routerFor = (): RouterDouble => {
  createAuthRouter();
  return RouterMock.mock.results[RouterMock.mock.results.length - 1]
    .value as RouterDouble;
};

describe("auth router", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Audit R1 (kit register-rate-limiter, D-01). Registration emails the address
  // it is given; the per-IP limiter must run first, so a request over the limit
  // is never parsed, validated, or turned into an email.
  it("puts the per-IP register limiter first on POST /register", () => {
    const router = routerFor();
    const registerCall = router.post.mock.calls.find(
      ([path]) => path === "/register",
    );

    expect(registerCall).toEqual([
      "/register",
      "registerIpRateLimiter",
      "requireJsonObjectBody",
      "validate",
      "register",
    ]);
  });
});
