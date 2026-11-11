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
  /**
   * Deletes every unaccepted invite for this email, expired or not, matched in any
   * case as the unique index matches: a re-invite replaces it (#249, ADR-0093).
   */
  deletePendingByEmailAndOrg(
    email: string,
    organizationId: string,
    tx?: PersistenceTransaction,
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
