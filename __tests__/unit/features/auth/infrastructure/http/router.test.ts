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
  loginRateLimiter: "loginRateLimiter",
  authSessionRateLimiter: "authSessionRateLimiter",
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

jest.mock("@/features/auth/infrastructure/http/controller.js", () => {
  // One set of handler mocks, returned by every call of the factory (ADR-0072).
  const handlers = {
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
  };
  return { createAuthController: jest.fn(() => handlers), handlers };
});

const routerFor = (): RouterDouble => {
  createAuthRouter({} as any);
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

  // A token submission is limited per IP first, sharing the budget of the route
  // that sent the token. /verify-email had only the global limiter (audit S13;
  // kit error-envelope-residuals, D-10).
  it.each([
    ["/reset-password", "passwordResetIpRateLimiter", "resetPassword"],
    ["/verify-email", "emailVerificationIpRateLimiter", "verifyEmail"],
  ])("puts the per-IP limiter first on POST %s", (path, limiter, handler) => {
    const router = routerFor();
    const call = router.post.mock.calls.find(([p]) => p === path);

    expect(call?.[1]).toBe(limiter);
    expect(call?.[call.length - 1]).toBe(handler);
  });

  // Kit api-tooling-residuals, D-08 (audit X26). These routes have no user, so
  // userRateLimiter counted all three by IP in one bucket: refreshes spent the
  // logins' budget. Each now has a per-IP limiter of its own, first in its chain.
  it.each([
    ["/login", "loginRateLimiter", "login"],
    ["/refresh", "authSessionRateLimiter", "refresh"],
    ["/logout", "authSessionRateLimiter", "logout"],
  ])("puts a limiter of its own first on POST %s", (path, limiter, handler) => {
    const router = routerFor();
    const call = router.post.mock.calls.find(([p]) => p === path);

    expect(call?.[1]).toBe(limiter);
    expect(call).not.toContain("userRateLimiter");
    expect(call?.[call.length - 1]).toBe(handler);
  });

  // A limiter keyed by user runs after authMiddleware, which sets req.user;
  // ahead of it, every request was counted by IP (audit R10; kit
  // register-rate-limiter, D-06).
  it.each<["put" | "post", string, string, string]>([
    ["put", "/profile", "userRateLimiter", "updateProfile"],
    ["post", "/switch-org", "switchOrgRateLimiter", "switchOrg"],
  ])(
    "runs authMiddleware ahead of the limiter on %s %s",
    (method, path, limiter, handler) => {
      const router = routerFor();
      const call = router[method].mock.calls.find(([p]) => p === path);

      expect(call?.slice(1, 3)).toEqual(["authMiddleware", limiter]);
      expect(call?.[call.length - 1]).toBe(handler);
    },
  );
});
