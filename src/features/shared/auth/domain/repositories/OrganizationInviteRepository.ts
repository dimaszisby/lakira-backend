import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import {
  OrganizationInvite,
  InviteRole,
} from "../entities/OrganizationInvite.js";

export type CreateOrganizationInviteDTO = {
  organizationId: string;
  email: string;
  role: InviteRole;
  tokenHash: string;
  expiresAt: Date;
};

export interface OrganizationInviteRepository {
  save(
    data: CreateOrganizationInviteDTO,
    tx?: PersistenceTransaction,
  ): Promise<OrganizationInvite>;
  findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<OrganizationInvite | null>;
  findByTokenHash(hash: string): Promise<OrganizationInvite | null>;
  findPendingByEmailAndOrg(
    email: string,
    organizationId: string,
  ): Promise<OrganizationInvite | null>;
  /** Deletes the unaccepted invites for this email that expired by `now`. */
  deleteExpiredPendingByEmailAndOrg(
    email: string,
    organizationId: string,
    now: Date,
  ): Promise<void>;
  /** The token is minted when the email is sent (durable-invite-email D-02). */
  replaceTokenHash(
    id: string,
    tokenHash: string,
    tx?: PersistenceTransaction,
  ): Promise<void>;
  deleteById(id: string): Promise<void>;
  markAccepted(id: string, now: Date): Promise<void>;
}
