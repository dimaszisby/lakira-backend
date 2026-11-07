import {
  ForbiddenError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { RefreshTokenRepository } from "../../domain/repositories/RefreshTokenRepository.js";
import { TokenProvider } from "../ports/TokenProvider.js";
import { IssueRefreshToken } from "./IssueRefreshToken.js";

export type SwitchOrganizationInput = {
  userId: string;
  organizationId: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type SwitchOrganizationResult = {
  accessToken: string;
  rawRefreshToken: string;
};

export class SwitchOrganization {
  constructor(
    private membershipRepo: MembershipRepository,
    private userRepo: UserRepository,
    private refreshTokenRepo: RefreshTokenRepository,
    private tokenProvider: TokenProvider,
    private issueRefreshToken: IssueRefreshToken,
  ) {}

  async execute(
    input: SwitchOrganizationInput,
  ): Promise<SwitchOrganizationResult> {
    const membership = await this.membershipRepo.findByUserAndOrg(
      input.userId,
      input.organizationId,
    );
    if (!membership || !membership.isActive()) {
      throw new ForbiddenError(
        "Forbidden: No active membership in this organization",
      );
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) throw new UnauthorizedError("Unauthorized: User not found");

    const activeTokens = await this.refreshTokenRepo.findActiveByUser(
      input.userId,
    );
    const familyIds = [...new Set(activeTokens.map((t) => t.familyId))];
    await Promise.all(
      familyIds.map((id) => this.refreshTokenRepo.revokeFamily(id)),
    );

    const accessToken = this.tokenProvider.sign({
      id: user.id,
      email: user.email,
      username: user.username,
      organizationId: input.organizationId,
    });

    const { rawToken } = await this.issueRefreshToken.execute({
      userId: user.id,
      organizationId: input.organizationId,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    return { accessToken, rawRefreshToken: rawToken };
  }
}
