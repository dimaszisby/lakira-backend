import {
  Membership,
  MembershipRole,
  MembershipStatus,
} from "../entities/Membership.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateMembershipDTO = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  status?: MembershipStatus;
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
