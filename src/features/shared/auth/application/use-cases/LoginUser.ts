import {
  ForbiddenError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { TokenProvider } from "../ports/TokenProvider.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";
import { IssueRefreshToken } from "./IssueRefreshToken.js";
import type { LoginAttemptsPort } from "../ports/LoginAttemptsPort.js";

export type LoginInput = {
  email: string;
  password: string;
  userAgent?: string | null;
  ip?: string | null;
};

export type LoginResult = {
  user: AuthUser;
  token: string;
  rawRefreshToken: string;
};

export class LoginUser {
  constructor(
    private repo: UserRepository,
    private membershipRepo: MembershipRepository,
    private hasher: PasswordHasher,
    private tokenProvider: TokenProvider,
    private issueRefreshToken: IssueRefreshToken,
    private attempts: LoginAttemptsPort,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const normalized = input.email.trim().toLowerCase();
    const user = await this.repo.findByEmail(normalized);
    if (!user) return this.refuse(input.email);

    const valid = await this.hasher.compare(input.password, user.passwordHash);
    if (!valid) return this.refuse(input.email);

    const membership = await this.membershipRepo.findDefaultByUser(user.id);
    if (!membership) {
      throw new ForbiddenError("No active organization membership");
    }

    const token = this.tokenProvider.sign({
      id: user.id,
      email: user.email,
      username: user.username,
      organizationId: membership.organizationId,
    });

    const { rawToken } = await this.issueRefreshToken.execute({
      userId: user.id,
      organizationId: membership.organizationId,
      userAgent: input.userAgent,
      ip: input.ip,
    });

    await this.attempts.reset(input.email);

    return { user, token, rawRefreshToken: rawToken };
  }

  /**
   * A wrong email or password counts toward the lockout, under the address as
   * it was typed, which is what the lockout check reads (application-errors D-04).
   */
  private async refuse(email: string): Promise<never> {
    await this.attempts.recordFailure(email);
    throw new UnauthorizedError("Invalid email or password");
  }
}
