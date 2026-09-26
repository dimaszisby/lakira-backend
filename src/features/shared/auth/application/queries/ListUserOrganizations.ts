import { MembershipRepository } from "../../domain/repositories/MembershipRepository.js";
import { OrganizationRepository } from "../../domain/repositories/OrganizationRepository.js";
import type { MembershipRole } from "../../domain/entities/Membership.js";

export type UserOrganizationDTO = {
  organizationId: string;
  name: string;
  slug: string;
  role: MembershipRole;
  joinedAt: string;
  isCurrent: boolean;
};

export type ListUserOrganizationsInput = {
  userId: string;
  currentOrganizationId: string;
};

export class ListUserOrganizations {
  constructor(
    private membershipRepo: MembershipRepository,
    private orgRepo: OrganizationRepository,
  ) {}

  async execute(
    input: ListUserOrganizationsInput,
  ): Promise<UserOrganizationDTO[]> {
    // Only memberships /switch-org would accept, so every listed id is switchable.
    const memberships = (
      await this.membershipRepo.findAllByUser(input.userId)
    ).filter((m) => m.isActive());

    const orgs = await this.orgRepo.findByIds(
      memberships.map((m) => m.organizationId),
    );
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    return memberships.reduce<UserOrganizationDTO[]>((acc, m) => {
      // A soft-deleted organization is not returned by findByIds.
      const org = orgMap.get(m.organizationId);
      if (!org) return acc;
      acc.push({
        organizationId: org.id,
        name: org.name,
        slug: org.slug,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        isCurrent: org.id === input.currentOrganizationId,
      });
      return acc;
    }, []);
  }
}
