import {
  Membership,
  MembershipRole,
  MembershipStatus,
} from "../entities/Membership.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateMembershipDTO = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  status?: MembershipStatus;
};

/** Where a page of memberships ended, in `joinedAt, id` order (api-tooling-residuals D-09). */
export type MembershipPosition = { joinedAt: Date; id: string };

export type MembershipPageRequest = {
  limit: number;
  after?: MembershipPosition;
};

export type MembershipPage = {
  items: Membership[];
  /** The last row read, when more follow; null on the last page. */
  next: MembershipPosition | null;
};

export interface MembershipRepository {
  findById(id: string): Promise<Membership | null>;
  findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null>;
  findDefaultByUser(userId: string): Promise<Membership | null>;
  findAllByUser(userId: string): Promise<Membership[]>;
  findAllByOrganization(organizationId: string): Promise<Membership[]>;
  /** A user's active memberships, a page at a time. */
  findActivePageByUser(
    userId: string,
    page: MembershipPageRequest,
  ): Promise<MembershipPage>;
  /** An organization's memberships, any status, a page at a time. */
  findPageByOrganization(
    organizationId: string,
    page: MembershipPageRequest,
  ): Promise<MembershipPage>;
  countByOrgAndRole(
    organizationId: string,
    role: MembershipRole,
  ): Promise<number>;
  create(
    data: CreateMembershipDTO,
    tx?: PersistenceTransaction,
  ): Promise<Membership>;
  save(membership: Membership): Promise<Membership>;
  delete(id: string): Promise<void>;
}
