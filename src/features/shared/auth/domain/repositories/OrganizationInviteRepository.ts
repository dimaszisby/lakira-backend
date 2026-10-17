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
  save(data: CreateOrganizationInviteDTO): Promise<OrganizationInvite>;
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
  markAccepted(id: string, now: Date): Promise<void>;
}
