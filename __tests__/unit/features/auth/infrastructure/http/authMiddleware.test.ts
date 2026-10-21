import { describe, it, expect, jest } from "@jest/globals";
import type { NextFunction, Response } from "express";
import { makeAuthMiddleware } from "@/features/auth/infrastructure/http/authMiddleware.js";
import type { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import type { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import type {
  TokenClaims,
  TokenProvider,
} from "@/features/auth/application/ports/TokenProvider.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import {
  Membership,
  type MembershipStatus,
} from "@/features/auth/domain/entities/Membership.js";
import { InvalidTokenError } from "@/features/auth/domain/errors/InvalidTokenError.js";
import AppError from "@/utils/AppError.js";
import type { AuthRequest } from "@/types/request.context.js";

const CLAIMS: TokenClaims = {
  userId: "user-1",
  email: "user@example.com",
  organizationId: "org-1",
  iat: 0,
  exp: 0,
};

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeMembership = (status: MembershipStatus = "active") =>
  Membership.fromPersistence({
    id: "mem-1",
    userId: "user-1",
    organizationId: "org-1",
    role: "owner",
    status,
    joinedAt: new Date(),
  });

const build = () => {
  const tokenProvider = {
    sign: jest.fn(),
    verify: jest.fn<TokenProvider["verify"]>(async () => CLAIMS),
  };
  const userRepo = {
    findById: jest.fn<UserRepository["findById"]>(async () => makeUser()),
  };
  const membershipRepo = {
    findByUserAndOrg: jest.fn<MembershipRepository["findByUserAndOrg"]>(
      async () => makeMembership(),
    ),
  };
  const middleware = makeAuthMiddleware(
    tokenProvider as unknown as TokenProvider,
    userRepo as unknown as UserRepository,
    membershipRepo as unknown as MembershipRepository,
  );
  return { middleware, tokenProvider, userRepo, membershipRepo };
};

/** Runs the middleware once and returns what it handed to next. */
const run = async (
  middleware: ReturnType<typeof makeAuthMiddleware>,
  authorization: string | null = "Bearer a.b.c",
) => {
  const headers = authorization === null ? {} : { authorization };
  const req = { headers } as unknown as AuthRequest;
  const next = jest.fn<(error?: unknown) => void>();
  await middleware(req, {} as Response, next as unknown as NextFunction);
  expect(next).toHaveBeenCalledTimes(1);
  return { req, passed: next.mock.calls[0][0] };
};

const expect401 = (passed: unknown, message: string) => {
  expect(passed).toBeInstanceOf(AppError);
  expect(passed).toMatchObject({ statusCode: 401, message });
};

describe("authMiddleware", () => {
  it("authenticates a valid token for an active member", async () => {
    const { middleware } = build();

    const { req, passed } = await run(middleware);

    expect(passed).toBeUndefined();
    expect(req.user?.id).toBe("user-1");
    expect(req.organizationId).toBe("org-1");
    expect(req.membership).toMatchObject({ role: "owner", userId: "user-1" });
  });

  it("answers 401 with no bearer token", async () => {
    const { middleware } = build();

    const { passed } = await run(middleware, null);

    expect401(passed, "Unauthorized: No token provided");
  });

  it("answers 401 for a token that fails verification", async () => {
    const { middleware, tokenProvider } = build();
    tokenProvider.verify.mockRejectedValue(new InvalidTokenError());

    const { passed } = await run(middleware);

    expect401(passed, "Unauthorized: Invalid token");
  });

  it("answers 401 for an unknown user, a token with no organization, an inactive membership", async () => {
    const unknown = build();
    unknown.userRepo.findById.mockResolvedValue(null);
    expect401(
      (await run(unknown.middleware)).passed,
      "Unauthorized: User not found",
    );

    const noOrg = build();
    noOrg.tokenProvider.verify.mockResolvedValue({
      ...CLAIMS,
      organizationId: null,
    });
    expect401(
      (await run(noOrg.middleware)).passed,
      "Unauthorized: Token missing organization context",
    );

    const inactive = build();
    inactive.membershipRepo.findByUserAndOrg.mockResolvedValue(
      makeMembership("removed"),
    );
    expect401(
      (await run(inactive.middleware)).passed,
      "Unauthorized: Organization membership inactive",
    );
  });

  // Kit auth-infrastructure-errors-are-5xx, D-01 (audit 2026-10-20, X61). A
  // failure that is not the token's reaches the error handler as itself, which
  // answers 500 and logs it, instead of a 401 that signs the user out.
  describe("a failure that is not the token's", () => {
    it("passes a failed user lookup on as itself", async () => {
      const { middleware, userRepo } = build();
      const failure = new Error("connection acquire timeout");
      userRepo.findById.mockRejectedValue(failure);

      const { passed } = await run(middleware);

      expect(passed).toBe(failure);
    });

    it("passes a failed membership lookup on as itself", async () => {
      const { middleware, membershipRepo } = build();
      const failure = new Error("connection terminated");
      membershipRepo.findByUserAndOrg.mockRejectedValue(failure);

      const { passed } = await run(middleware);

      expect(passed).toBe(failure);
    });

    it("passes an error from verify that is not about the token on as itself", async () => {
      const { middleware, tokenProvider } = build();
      const failure = new Error("key store unavailable");
      tokenProvider.verify.mockRejectedValue(failure);

      const { passed } = await run(middleware);

      expect(passed).toBe(failure);
    });
  });
});
