import { jest } from "@jest/globals";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "@/types/request.context.js";
import type { buildAuthFeature } from "@/features/auth/feature.js";

type ControllerModule =
  typeof import("@/features/auth/infrastructure/http/controller.js");
let register: ControllerModule["register"];
let login: ControllerModule["login"];
let getProfile: ControllerModule["getProfile"];
let updateProfile: ControllerModule["updateProfile"];
let logout: ControllerModule["logout"];
let verifyEmail: ControllerModule["verifyEmail"];
let resendVerification: ControllerModule["resendVerification"];
let switchOrg: ControllerModule["switchOrg"];
let overrideAuthFeatureForTest: ControllerModule["overrideAuthFeatureForTest"];

type AuthFeature = ReturnType<typeof buildAuthFeature>;
type AsyncMock = jest.MockedFunction<(...args: any[]) => Promise<any>>;

const registerExecute: AsyncMock = jest.fn();
const loginExecute: AsyncMock = jest.fn();
const getProfileExecute: AsyncMock = jest.fn();
const updateProfileExecute: AsyncMock = jest.fn();
const rotateRefreshTokenExecute: AsyncMock = jest.fn();
const revokeRefreshTokenFamilyExecute: AsyncMock = jest.fn();
const requestEmailVerificationExecute: AsyncMock = jest.fn(
  async () => undefined,
) as unknown as AsyncMock;
const verifyEmailExecute: AsyncMock = jest.fn();
const switchOrganizationExecute: AsyncMock = jest.fn();

const assertAuthenticatedMock = jest.fn();

const checkLockoutMock: AsyncMock = jest.fn(async () => undefined) as AsyncMock;
const recordFailedAttemptMock: AsyncMock = jest.fn(
  async () => undefined,
) as AsyncMock;
const resetLockoutMock: AsyncMock = jest.fn(async () => undefined) as AsyncMock;

jest.mock("@/utils/auth-guards.js", () => ({
  assertAuthenticated: assertAuthenticatedMock,
}));

const loadController = async () => {
  const controller =
    await import("@/features/auth/infrastructure/http/controller.js");
  register = controller.register;
  login = controller.login;
  getProfile = controller.getProfile;
  updateProfile = controller.updateProfile;
  logout = controller.logout;
  verifyEmail = controller.verifyEmail;
  resendVerification = controller.resendVerification;
  switchOrg = controller.switchOrg;
  overrideAuthFeatureForTest = controller.overrideAuthFeatureForTest;
};

const buildFeatureMocks = (): AuthFeature =>
  ({
    registerUser: { execute: registerExecute },
    loginUser: { execute: loginExecute },
    getProfile: { execute: getProfileExecute },
    updateProfile: { execute: updateProfileExecute },
    rotateRefreshToken: { execute: rotateRefreshTokenExecute },
    revokeRefreshTokenFamily: { execute: revokeRefreshTokenFamilyExecute },
    requestEmailVerification: { execute: requestEmailVerificationExecute },
    verifyEmail: { execute: verifyEmailExecute },
    switchOrganization: { execute: switchOrganizationExecute },
    loginLockout: {
      check: checkLockoutMock,
      recordFailedAttempt: recordFailedAttemptMock,
      reset: resetLockoutMock,
    },
  }) as unknown as AuthFeature;

const res = () =>
  ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    setHeader: jest.fn(),
  }) as unknown as Response;

const next: NextFunction = jest.fn();

beforeAll(async () => {
  await loadController();
  await import("@/utils/auth-guards.js");
});

describe("Auth HTTP controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    overrideAuthFeatureForTest(buildFeatureMocks());
  });

  it("registers new users via use case", async () => {
    const user = {
      id: "user-1",
      email: "user@example.com",
      username: "tester",
      isPublicProfile: true,
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    registerExecute.mockResolvedValue({
      token: "jwt",
      user,
      rawRefreshToken: "refresh-raw",
    });

    const req = {
      body: {
        email: "user@example.com",
        username: "tester",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      },
      headers: { "user-agent": "test" },
      ip: "127.0.0.1",
    } as unknown as AuthRequest;

    const response = res();
    await register(req, response, next);

    expect(registerExecute).toHaveBeenCalledWith({
      email: "user@example.com",
      username: "tester",
      password: "Password123!",
      passwordConfirmation: "Password123!",
      isPublicProfile: undefined,
      userAgent: "test",
      ip: "127.0.0.1",
    });
    // AC-1: registration sets the refresh cookie, as login does.
    expect(response.cookie).toHaveBeenCalledWith(
      expect.stringContaining("refresh"),
      "refresh-raw",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        message: "User created successfully",
        data: expect.objectContaining({ token: "jwt" }),
      }),
    );
  });

  it("logs users in via use case", async () => {
    const user = {
      id: "user-1",
      email: "user@example.com",
      username: "tester",
      isPublicProfile: true,
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    loginExecute.mockResolvedValue({
      token: "jwt",
      user,
      rawRefreshToken: "refresh-raw",
    });

    const req = {
      body: { email: "user@example.com", password: "Password123!" },
      headers: { "user-agent": "test" },
      ip: "127.0.0.1",
    } as unknown as AuthRequest;

    const response = res();
    await login(req, response, next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(loginExecute).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "Password123!",
      userAgent: "test",
      ip: "127.0.0.1",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        data: expect.objectContaining({ token: "jwt" }),
      }),
    );
    expect(checkLockoutMock).toHaveBeenCalledWith("user@example.com");
    expect(resetLockoutMock).toHaveBeenCalledWith("user@example.com");
    expect(recordFailedAttemptMock).not.toHaveBeenCalled();
  });

  it("records a failed attempt when login throws 401", async () => {
    const { default: AppError } = await import("@/utils/AppError.js");
    loginExecute.mockRejectedValue(new AppError("Invalid credentials", 401));

    const req = {
      body: { email: "user@example.com", password: "Password123!" },
      headers: { "user-agent": "test" },
      ip: "127.0.0.1",
    } as unknown as AuthRequest;

    const response = res();
    const errorNext = jest.fn();
    await login(req, response, errorNext);
    await new Promise((resolve) => setImmediate(resolve));

    expect(recordFailedAttemptMock).toHaveBeenCalledWith("user@example.com");
    expect(resetLockoutMock).not.toHaveBeenCalled();
    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it("sets Retry-After header and skips use case when lockout returns 429", async () => {
    const { default: AppError } = await import("@/utils/AppError.js");
    checkLockoutMock.mockRejectedValueOnce(
      new AppError("Too many failed login attempts", 429),
    );

    const req = {
      body: { email: "victim@example.com", password: "Password123!" },
      headers: { "user-agent": "test" },
      ip: "127.0.0.1",
    } as unknown as AuthRequest;

    const response = res();
    const errorNext = jest.fn();
    await login(req, response, errorNext);
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "900");
    expect(loginExecute).not.toHaveBeenCalled();
    expect(recordFailedAttemptMock).not.toHaveBeenCalled();
    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it("returns the authenticated profile", async () => {
    getProfileExecute.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      username: "tester",
      isPublicProfile: true,
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const req = {
      user: { id: "user-1" },
      organizationId: "org-1",
      membership: {
        id: "mem-1",
        role: "owner",
        organizationId: "org-1",
        userId: "user-1",
      },
    } as unknown as AuthRequest;

    const response = res();
    await getProfile(req, response, next);

    expect(getProfileExecute).toHaveBeenCalledWith("user-1");
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        data: expect.objectContaining({ id: "user-1" }),
      }),
    );
  });

  it("updates profile using feature use case", async () => {
    updateProfileExecute.mockResolvedValue({
      id: "user-1",
      email: "new@example.com",
      username: "new",
      isPublicProfile: false,
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const req = {
      user: { id: "user-1" },
      organizationId: "org-1",
      membership: {
        id: "mem-1",
        role: "owner",
        organizationId: "org-1",
        userId: "user-1",
      },
      body: {
        email: "new@example.com",
        username: "new",
        password: "Password123!",
        isPublicProfile: false,
      },
    } as unknown as AuthRequest;

    const response = res();
    await updateProfile(req, response, next);

    expect(updateProfileExecute).toHaveBeenCalledWith({
      userId: "user-1",
      email: "new@example.com",
      username: "new",
      password: "Password123!",
      isPublicProfile: false,
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Profile updated successfully",
        data: expect.objectContaining({
          user: expect.objectContaining({ id: "user-1" }),
        }),
      }),
    );
  });

  it("requires authentication before fetching profile", async () => {
    const response = res();
    const errorNext = jest.fn();

    await getProfile({} as AuthRequest, response, errorNext);

    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it("requires authentication before updating profile", async () => {
    const response = res();
    const errorNext = jest.fn();

    await updateProfile({ body: {} } as AuthRequest, response, errorNext);

    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it("logs out and clears refresh cookie", async () => {
    const response = res();
    const req = { cookies: {}, headers: {} } as unknown as AuthRequest;

    await logout(req, response, next);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        message: "Logged out successfully",
        data: null,
      }),
    );
  });

  it("verifies email via use case and returns 200 with null data", async () => {
    verifyEmailExecute.mockResolvedValue(undefined);

    const req = {
      body: { token: "some-raw-token" },
    } as unknown as AuthRequest;

    const response = res();
    await verifyEmail(req, response, next);

    expect(verifyEmailExecute).toHaveBeenCalledWith({
      token: "some-raw-token",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        message: "Email verified successfully.",
        data: null,
      }),
    );
  });

  it("resends verification email fire-and-forget and returns 200 immediately", async () => {
    const req = {
      user: { id: "user-1", email: "user@example.com" },
      organizationId: "org-1",
      membership: {
        id: "mem-1",
        role: "owner",
        organizationId: "org-1",
        userId: "user-1",
      },
    } as unknown as AuthRequest;

    const response = res();
    await resendVerification(req, response, next);

    expect(requestEmailVerificationExecute).toHaveBeenCalledWith({
      userId: "user-1",
      email: "user@example.com",
    });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        message: expect.stringMatching(/unverified/i),
      }),
    );
  });

  it("requires authentication for resend verification", async () => {
    const response = res();
    const errorNext = jest.fn();

    await resendVerification({} as AuthRequest, response, errorNext);

    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it("switches org and returns new access token with refresh cookie", async () => {
    const targetOrgId = "00000000-0000-4000-8000-000000000002";
    switchOrganizationExecute.mockResolvedValue({
      accessToken: "new-jwt",
      rawRefreshToken: "new-refresh",
    });

    const req = {
      user: { id: "user-1" },
      organizationId: "org-1",
      membership: {
        id: "mem-1",
        role: "owner",
        organizationId: "org-1",
        userId: "user-1",
      },
      body: { organizationId: targetOrgId },
      headers: { "user-agent": "test" },
      ip: "127.0.0.1",
    } as unknown as AuthRequest;

    const response = res();
    await switchOrg(req, response, next);

    expect(switchOrganizationExecute).toHaveBeenCalledWith({
      userId: "user-1",
      organizationId: targetOrgId,
      userAgent: "test",
      ip: "127.0.0.1",
    });
    expect(response.cookie).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "success",
        data: expect.objectContaining({ token: "new-jwt" }),
      }),
    );
  });

  it("requires authentication for switch-org", async () => {
    const response = res();
    const errorNext = jest.fn();

    await switchOrg(
      { body: { organizationId: "org-2" } } as unknown as AuthRequest,
      response,
      errorNext,
    );

    expect(errorNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
