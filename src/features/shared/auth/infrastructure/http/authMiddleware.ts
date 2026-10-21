import { Response, NextFunction } from "express";
import AppError from "@/utils/AppError.js";
import { AuthRequest } from "@/types/request.context.js";
import { UserDomain } from "@/types/domain/user.domain.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { UserRepositorySequelize } from "../persistence/UserRepositorySequelize.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { MembershipRepositorySequelize } from "../persistence/MembershipRepositorySequelize.js";
import { TokenProvider } from "../../application/ports/TokenProvider.js";
import { JwtTokenProvider } from "../providers/JwtTokenProvider.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";
import { DomainError } from "@/shared/domain/errors/DomainError.js";
import type { TokenClaims } from "../../application/ports/TokenProvider.js";

type Dependencies = {
  userRepo: UserRepository;
  membershipRepo: MembershipRepository;
  tokenProvider: TokenProvider;
};

const defaultDependencies = (): Dependencies => ({
  userRepo: new UserRepositorySequelize(),
  membershipRepo: new MembershipRepositorySequelize(),
  tokenProvider: new JwtTokenProvider(),
});

const toUserDomain = (user: AuthUser, organizationId: string): UserDomain => ({
  id: user.id,
  username: user.username,
  email: user.email,
  isPublicProfile: user.isPublicProfile,
  emailVerifiedAt: user.emailVerifiedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  deletedAt: user.deletedAt,
  organizationId,
});

export const makeAuthMiddleware = (
  tokenProvider: TokenProvider,
  userRepo: UserRepository,
  membershipRepo: MembershipRepository,
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError("Unauthorized: No token provided", 401));
    }

    const token = authHeader.split(" ")[1];

    // Only a token that fails verification is the client's fault. Anything else,
    // a database failure above all, reaches the error handler as itself: a logged
    // 500, not a 401 that signs the user out (auth-infrastructure-errors-are-5xx D-01).
    let claims: TokenClaims;
    try {
      claims = await tokenProvider.verify(token);
    } catch (error) {
      if (error instanceof DomainError && error.kind === "unauthorized") {
        return next(new AppError("Unauthorized: Invalid token", 401));
      }
      return next(error);
    }

    try {
      const authUser = await userRepo.findById(claims.userId);

      if (!authUser) {
        return next(new AppError("Unauthorized: User not found", 401));
      }

      if (!claims.organizationId) {
        return next(
          new AppError("Unauthorized: Token missing organization context", 401),
        );
      }

      const membership = await membershipRepo.findByUserAndOrg(
        authUser.id,
        claims.organizationId,
      );
      if (!membership || !membership.isActive()) {
        return next(
          new AppError("Unauthorized: Organization membership inactive", 401),
        );
      }

      req.user = toUserDomain(authUser, membership.organizationId);
      req.organizationId = membership.organizationId;
      req.membership = {
        id: membership.id,
        role: membership.role,
        organizationId: membership.organizationId,
        userId: membership.userId,
      };
      next();
    } catch (error) {
      // Express 4 does not catch a rejected async middleware.
      return next(error);
    }
  };
};

export const createAuthMiddleware = (
  deps: Dependencies = defaultDependencies(),
) => {
  return makeAuthMiddleware(
    deps.tokenProvider,
    deps.userRepo,
    deps.membershipRepo,
  );
};

// The default instance is built on its first request, never at import (ADR-0045): sibling
// routers import this module, and constructing repositories during that import is what
// let a half-loaded feature hand out `undefined`. The export stays one stable function, so
// routers and tests can keep referring to it by identity.
type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
let defaultAuthMiddleware: AuthMiddleware | undefined;

export const authMiddleware: AuthMiddleware = (req, res, next) =>
  (defaultAuthMiddleware ??= createAuthMiddleware())(req, res, next);
