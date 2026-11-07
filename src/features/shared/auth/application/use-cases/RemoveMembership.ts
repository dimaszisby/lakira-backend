import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";

export type RemoveMembershipInput = {
  membershipId: string;
  organizationId: string;
  actorRole: string;
  actorUserId: string;
};

export class RemoveMembership {
  constructor(private membershipRepo: MembershipRepository) {}

  async execute(input: RemoveMembershipInput): Promise<void> {
    if (input.actorRole !== "owner") {
      throw new ForbiddenError("Forbidden: only owner can remove members");
    }

    const membership = await this.membershipRepo.findById(input.membershipId);
    if (!membership) {
      throw new NotFoundError("Membership not found");
    }

    if (membership.organizationId !== input.organizationId) {
      throw new NotFoundError("Membership not found");
    }

    if (membership.userId === input.actorUserId) {
      throw new ValidationError("Cannot remove yourself from the organization");
    }

    if (membership.isOwner()) {
      const ownerCount = await this.membershipRepo.countByOrgAndRole(
        input.organizationId,
        "owner",
      );
      if (ownerCount <= 1) {
        throw new ValidationError(
          "Cannot remove the last owner of the organization",
        );
      }
    }

    await this.membershipRepo.delete(membership.id);
  }
}
