import {
  Op,
  Transaction,
  UniqueConstraintError,
  col,
  fn,
  where,
} from "sequelize";
import AppError from "@/utils/AppError.js";
import { models } from "@/infrastructure/db/models.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { OrganizationInvite } from "../../domain/entities/OrganizationInvite.js";
import {
  CreateOrganizationInviteDTO,
  OrganizationInviteRepository,
} from "../../domain/repositories/OrganizationInviteRepository.js";
import type { OrganizationInvite as InviteModel } from "./models/organization-invite.sequelize.js";
import { PENDING_INVITE_EXISTS_MESSAGE } from "../../application/use-cases/InviteUserToOrganization.js";

// Migration 20261018000001: one unaccepted invite per organization and email.
const PENDING_EMAIL_INDEX = "uq_organization_invites_pending_email";

const isPendingEmailConflict = (err: unknown): boolean =>
  err instanceof UniqueConstraintError &&
  (err.parent as { constraint?: string } | undefined)?.constraint ===
    PENDING_EMAIL_INDEX;

const toDomain = (row: InviteModel): OrganizationInvite =>
  OrganizationInvite.fromPersistence({
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt ?? new Date(0),
  });

export class OrganizationInviteRepositorySequelize implements OrganizationInviteRepository {
  async save(
    data: CreateOrganizationInviteDTO,
    tx?: PersistenceTransaction,
  ): Promise<OrganizationInvite> {
    const transaction = tx as Transaction | undefined;
    try {
      const created = await models.OrganizationInvite.create(
        {
          organizationId: data.organizationId,
          email: data.email,
          role: data.role,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        },
        { transaction },
      );
      await created.reload({ transaction });
      return toDomain(created);
    } catch (err) {
      // A concurrent invite passed the same pending check first.
      if (isPendingEmailConflict(err)) {
        throw new AppError(PENDING_INVITE_EXISTS_MESSAGE, 409);
      }
      throw err;
    }
  }

  async findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<OrganizationInvite | null> {
    const row = await models.OrganizationInvite.findByPk(id, {
      transaction: tx as Transaction | undefined,
    });
    return row ? toDomain(row) : null;
  }

  async findByTokenHash(hash: string): Promise<OrganizationInvite | null> {
    const row = await models.OrganizationInvite.findOne({
      where: { tokenHash: hash },
    });
    return row ? toDomain(row) : null;
  }

  async findPendingByEmailAndOrg(
    email: string,
    organizationId: string,
  ): Promise<OrganizationInvite | null> {
    const row = await models.OrganizationInvite.findOne({
      where: {
        email,
        organizationId,
        acceptedAt: { [Op.is]: null },
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    return row ? toDomain(row) : null;
  }

  async deleteExpiredPendingByEmailAndOrg(
    email: string,
    organizationId: string,
    now: Date,
  ): Promise<void> {
    // Matched as the index matches, so a row stored in another case goes too.
    await models.OrganizationInvite.destroy({
      where: {
        [Op.and]: [
          where(fn("lower", col("email")), email.toLowerCase()),
          { organizationId },
          { acceptedAt: { [Op.is]: null } },
          { expiresAt: { [Op.lte]: now } },
        ],
      },
    });
  }

  async replaceTokenHash(
    id: string,
    tokenHash: string,
    tx?: PersistenceTransaction,
  ): Promise<void> {
    await models.OrganizationInvite.update(
      { tokenHash },
      { where: { id }, transaction: tx as Transaction | undefined },
    );
  }

  async deleteById(id: string): Promise<void> {
    await models.OrganizationInvite.destroy({ where: { id } });
  }

  async markAccepted(id: string, now: Date): Promise<void> {
    await models.OrganizationInvite.update(
      { acceptedAt: now },
      { where: { id } },
    );
  }
}
