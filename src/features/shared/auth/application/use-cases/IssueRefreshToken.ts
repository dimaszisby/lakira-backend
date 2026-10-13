import { RefreshToken } from "../../domain/entities/RefreshToken.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { TokenHasher } from "../ports/TokenHasher.js";

export type IssueRefreshTokenInput = {
  userId: string;
  familyId?: string;
  organizationId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
};

export type IssueRefreshTokenResult = {
  rawToken: string;
  refreshToken: RefreshToken;
};

export class IssueRefreshToken {
  constructor(
    private refreshTokenRepo: RefreshTokenRepository,
    private tokenHasher: TokenHasher,
    private ttlDays: number,
  ) {}

  async execute(
    input: IssueRefreshTokenInput,
  ): Promise<IssueRefreshTokenResult> {
    const rawToken = this.tokenHasher.generate();
    const tokenHash = this.tokenHasher.hash(rawToken);

    const refreshToken = RefreshToken.issue(input.userId, tokenHash, {
      familyId: input.familyId,
      organizationId: input.organizationId,
      ttlDays: this.ttlDays,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await this.refreshTokenRepo.save(refreshToken);

    return { rawToken, refreshToken };
  }

  async executeInTransaction(
    input: IssueRefreshTokenInput,
    tx: PersistenceTransaction,
  ): Promise<IssueRefreshTokenResult> {
    const rawToken = this.tokenHasher.generate();
    const tokenHash = this.tokenHasher.hash(rawToken);

    const refreshToken = RefreshToken.issue(input.userId, tokenHash, {
      familyId: input.familyId,
      organizationId: input.organizationId,
      ttlDays: this.ttlDays,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await this.refreshTokenRepo.save(refreshToken, tx);

    return { rawToken, refreshToken };
  }
}
