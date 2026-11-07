import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import type { MembershipRole } from "../../domain/entities/Membership.js";

export type ChangeMemberRoleInput = {
  membershipId: string;
  organizationId: string;
  newRole: MembershipRole;
  actorRole: string;
};

export class ChangeMemberRole {
  constructor(private membershipRepo: MembershipRepository) {}

  async execute(input: ChangeMemberRoleInput): Promise<void> {
    if (input.actorRole !== "owner") {
      throw new ForbiddenError("Forbidden: only owner can change member roles");
    }

    const membership = await this.membershipRepo.findById(input.membershipId);
    if (!membership) {
      throw new NotFoundError("Membership not found");
    }

    if (membership.organizationId !== input.organizationId) {
      throw new NotFoundError("Membership not found");
    }

    if (membership.role === input.newRole) {
      return;
    }

    if (membership.isOwner()) {
      const ownerCount = await this.membershipRepo.countByOrgAndRole(
        input.organizationId,
        "owner",
      );
      if (ownerCount <= 1) {
        throw new ValidationError(
          "Cannot demote the last owner of the organization",
        );
      }
    }

    membership.changeRole(input.newRole);
    await this.membershipRepo.save(membership);
  }
}
