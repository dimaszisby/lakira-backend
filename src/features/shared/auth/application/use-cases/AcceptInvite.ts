import {
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import crypto from "node:crypto";
import { OrganizationInviteRepository } from "../../domain/repositories/OrganizationInviteRepository.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";

export type AcceptInviteInput = {
  rawToken: string;
  userId: string;
};

const GENERIC_ERROR = "Invalid or expired invitation";

export class AcceptInvite {
  constructor(
    private inviteRepo: OrganizationInviteRepository,
    private membershipRepo: MembershipRepository,
    private userRepo: UserRepository,
  ) {}

  async execute(input: AcceptInviteInput): Promise<void> {
    const tokenHash = crypto
      .createHash("sha256")
      .update(input.rawToken)
      .digest("hex");

    const invite = await this.inviteRepo.findByTokenHash(tokenHash);
    if (!invite) {
      throw new ValidationError(GENERIC_ERROR);
    }

    if (invite.isAccepted()) {
      throw new ValidationError(GENERIC_ERROR);
    }

    if (invite.isExpired()) {
      throw new ValidationError(GENERIC_ERROR);
    }

    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      throw new ValidationError(GENERIC_ERROR);
    }

    const existingMembership = await this.membershipRepo.findByUserAndOrg(
      user.id,
      invite.organizationId,
    );
    if (existingMembership) {
      await this.inviteRepo.markAccepted(invite.id, new Date());
      return;
    }

    await this.membershipRepo.create({
      userId: user.id,
      organizationId: invite.organizationId,
      role: invite.role,
      status: "active",
    });

    await this.inviteRepo.markAccepted(invite.id, new Date());
  }
}
