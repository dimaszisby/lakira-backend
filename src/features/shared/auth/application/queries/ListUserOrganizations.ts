import type {
  MembershipPageRequest,
  MembershipPosition,
  MembershipRepository,
} from "../../domain/repositories/MembershipRepository.js";
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
  page: MembershipPageRequest;
};

export class ListUserOrganizations {
  constructor(
    private membershipRepo: MembershipRepository,
    private orgRepo: OrganizationRepository,
  ) {}

  // A page of the user's active memberships (api-tooling-residuals D-09). An
  // organization since deleted is left out, so a page can be shorter than its
  // limit; `next` follows the last membership read, so none is skipped.
  async execute(input: ListUserOrganizationsInput): Promise<{
    organizations: UserOrganizationDTO[];
    next: MembershipPosition | null;
  }> {
    // Only memberships /switch-org would accept, so every listed id is switchable.
    const { items: memberships, next } =
      await this.membershipRepo.findActivePageByUser(input.userId, input.page);

    const orgs = await this.orgRepo.findByIds(
      memberships.map((m) => m.organizationId),
    );
    const orgMap = new Map(orgs.map((o) => [o.id, o]));

    const organizations = memberships.reduce<UserOrganizationDTO[]>(
      (acc, m) => {
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
      },
      [],
    );
    return { organizations, next };
  }
}
