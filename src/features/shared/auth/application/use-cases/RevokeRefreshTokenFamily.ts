import { UnauthorizedError } from "@/shared/domain/errors/DomainError.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { TokenHasher } from "../ports/TokenHasher.js";

export class RevokeRefreshTokenFamily {
  constructor(
    private refreshTokenRepo: RefreshTokenRepository,
    private tokenHasher: TokenHasher,
  ) {}

  async execute(rawToken: string): Promise<void> {
    const tokenHash = this.tokenHasher.hash(rawToken);
    const existing = await this.refreshTokenRepo.findByTokenHash(tokenHash);

    if (!existing) {
      throw new UnauthorizedError("Unauthorized: Invalid refresh token");
    }

    await this.refreshTokenRepo.revokeFamily(existing.familyId);
  }
}
