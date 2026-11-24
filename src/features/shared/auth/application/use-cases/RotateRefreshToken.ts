import { UnauthorizedError } from "@/shared/domain/errors/DomainError.js";
import logger from "@/utils/logger.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import { TokenProvider, TokenPayload } from "../ports/TokenProvider.js";
import { TokenHasher } from "../ports/TokenHasher.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { IssueRefreshToken } from "./IssueRefreshToken.js";

export type RotateRefreshTokenInput = {
  rawToken: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type RotateRefreshTokenResult = {
  accessToken: string;
  rawRefreshToken: string;
};

type RevokeAndReject = {
  kind: "revoke";
  familyId: string;
  /** `reuse`: rotated away, then presented again. `revoked`: a session that ended. */
  reason: "reuse" | "revoked" | "expired";
  ip?: string | null;
  userAgent?: string | null;
  userId?: string;
};

export class RotateRefreshToken {
  constructor(
    private refreshTokenRepo: RefreshTokenRepository,
    private userRepo: UserRepository,
    private membershipRepo: MembershipRepository,
    private tokenProvider: TokenProvider,
    private tokenHasher: TokenHasher,
    private issueRefreshToken: IssueRefreshToken,
    private tx: TransactionPort,
  ) {}

  async execute(
    input: RotateRefreshTokenInput,
  ): Promise<RotateRefreshTokenResult> {
    const tokenHash = this.tokenHasher.hash(input.rawToken);

    const result = await this.tx.runInTransaction<
      RotateRefreshTokenResult | RevokeAndReject
    >(async (transaction) => {
      const existing = await this.refreshTokenRepo.findByTokenHashForUpdate(
        tokenHash,
        transaction,
      );

      if (!existing) {
        throw new UnauthorizedError("Unauthorized: Invalid refresh token");
      }

      if (existing.isRevoked()) {
        // Only a token that was rotated away is evidence of theft. One revoked
        // where it stood, by logout, an organization switch, or a password
        // reset or change, is a session that ended (ADR-0097).
        return {
          kind: "revoke",
          familyId: existing.familyId,
          reason: existing.replacedById === null ? "revoked" : "reuse",
          ip: input.ip,
          userAgent: input.userAgent,
          userId: existing.userId,
        } as RevokeAndReject;
      }

      if (existing.isExpired()) {
        return {
          kind: "revoke",
          familyId: existing.familyId,
          reason: "expired",
        } as RevokeAndReject;
      }

      const user = await this.userRepo.findById(existing.userId);
      if (!user) {
        throw new UnauthorizedError("Unauthorized: User not found");
      }

      let organizationId: string;
      if (existing.organizationId) {
        const membership = await this.membershipRepo.findByUserAndOrg(
          existing.userId,
          existing.organizationId,
        );
        if (!membership || !membership.isActive()) {
          throw new UnauthorizedError(
            "Unauthorized: Organization membership inactive",
          );
        }
        organizationId = existing.organizationId;
      } else {
        const membership = await this.membershipRepo.findDefaultByUser(
          existing.userId,
        );
        if (!membership) {
          throw new UnauthorizedError(
            "Unauthorized: No organization membership",
          );
        }
        organizationId = membership.organizationId;
      }

      existing.markRevoked();
      const { rawToken: newRawToken, refreshToken: newRefreshToken } =
        await this.issueRefreshToken.executeInTransaction(
          {
            userId: existing.userId,
            familyId: existing.familyId,
            organizationId,
            userAgent: input.userAgent,
            ip: input.ip,
          },
          transaction,
        );

      existing.replaceWith(newRefreshToken.id);
      await this.refreshTokenRepo.save(existing, transaction);

      const accessToken = this.tokenProvider.sign({
        id: user.id,
        email: user.email,
        username: user.username,
        organizationId,
      } as TokenPayload);

      logger.info("auth.refresh.success", {
        userId: existing.userId,
        familyId: existing.familyId,
      });

      return { accessToken, rawRefreshToken: newRawToken };
    });

    if ("kind" in result && result.kind === "revoke") {
      if (result.reason === "reuse") {
        logger.warn("auth.refresh.reuse_detected", {
          userId: result.userId,
          familyId: result.familyId,
          ip: result.ip,
          userAgent: result.userAgent,
        });
      } else if (result.reason === "revoked") {
        logger.info("auth.refresh.session_ended", {
          userId: result.userId,
          familyId: result.familyId,
        });
      }
      await this.refreshTokenRepo.revokeFamily(result.familyId);
      throw new UnauthorizedError("Unauthorized: Invalid refresh token");
    }

    return result as RotateRefreshTokenResult;
  }
}
