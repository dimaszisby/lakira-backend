import type {
  MembershipPageRequest,
  MembershipPosition,
  MembershipRepository,
} from "../../domain/repositories/MembershipRepository.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import type {
  MembershipRole,
  MembershipStatus,
} from "../../domain/entities/Membership.js";

export type MemberDTO = {
  membershipId: string;
  userId: string;
  username: string;
  email: string;
  role: MembershipRole;
  status: MembershipStatus;
  joinedAt: string;
};

export class ListOrganizationMembers {
  constructor(
    private membershipRepo: MembershipRepository,
    private userRepo: UserRepository,
  ) {}

  // A page of memberships (api-tooling-residuals D-09). A membership whose user is
  // gone is left out, so a page can be shorter than its limit; `next` follows the
  // last membership read, so none is skipped.
  async execute(
    organizationId: string,
    page: MembershipPageRequest,
  ): Promise<{ members: MemberDTO[]; next: MembershipPosition | null }> {
    const { items: memberships, next } =
      await this.membershipRepo.findPageByOrganization(organizationId, page);

    const userIds = memberships.map((m) => m.userId);
    const users = await this.userRepo.findByIds(userIds);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const members = memberships.reduce<MemberDTO[]>((acc, m) => {
      const user = userMap.get(m.userId);
      if (!user) return acc;
      acc.push({
        membershipId: m.id,
        userId: user.id,
        username: user.username,
        email: user.email,
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt.toISOString(),
      });
      return acc;
    }, []);
    return { members, next };
  }
}
