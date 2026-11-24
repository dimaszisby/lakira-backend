import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import type { TransactionPort } from "@/shared/application/ports/TransactionPort.js";
import logger from "@/utils/logger.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";
import { IssueRefreshToken } from "./IssueRefreshToken.js";

export type UpdateProfileInput = {
  userId: string;
  /** The organization of the session making the change; a new password re-issues it. */
  organizationId: string;
  userAgent?: string | null;
  ip?: string | null;
  email?: string;
  username?: string;
  password?: string;
  isPublicProfile?: boolean;
};

export type UpdateProfileResult = {
  user: AuthUser;
  /** Set only when the password changed: this session's new refresh token. */
  rawRefreshToken: string | null;
};

export class UpdateProfile {
  constructor(
    private repo: UserRepository,
    private hasher: PasswordHasher,
    private refreshTokenRepo: RefreshTokenRepository,
    private issueRefreshToken: IssueRefreshToken,
    private tx: TransactionPort,
  ) {}

  async execute(input: UpdateProfileInput): Promise<UpdateProfileResult> {
    const { userId } = input;
    if (!userId) throw new UnauthorizedError("User not authenticated");

    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    if (input.email && input.email.toLowerCase() !== user.email) {
      if (await this.repo.existsByEmail(input.email.toLowerCase()))
        throw new ConflictError("Email already in use");
      user.changeEmail(input.email);
    }

    if (input.username && input.username !== user.username) {
      if (await this.repo.existsByUsername(input.username))
        throw new ConflictError("Username already in use");
      user.changeUsername(input.username);
    }

    if (typeof input.isPublicProfile === "boolean") {
      user.togglePublicProfile(input.isPublicProfile);
    }

    if (!input.password) {
      return { user: await this.repo.save(user), rawRefreshToken: null };
    }

    const passwordHash = await this.hasher.hash(input.password);
    user.setPasswordHash(passwordHash);

    // A new password ends every session the user has, this one included, and
    // this one continues on a token issued after the revocation (ADR-0097).
    // The revocation runs before the user row is written: a new email or
    // username locks that row against the key-share lock a concurrent refresh
    // needs to insert its token, and that refresh holds a token row this
    // revocation waits for. In the other order the two deadlock.
    const result = await this.tx.runInTransaction(async (tx) => {
      await this.refreshTokenRepo.revokeAllForUser(user.id, new Date(), tx);
      const saved = await this.repo.save(user, tx);
      const { rawToken } = await this.issueRefreshToken.executeInTransaction(
        {
          userId: user.id,
          organizationId: input.organizationId,
          userAgent: input.userAgent,
          ip: input.ip,
        },
        tx,
      );
      return { user: saved, rawRefreshToken: rawToken };
    });

    logger.info("auth.sessions.revoked", {
      userId: user.id,
      reason: "password_change",
    });
    return result;
  }
}
