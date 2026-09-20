import { Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import {
  Membership,
  MembershipRole,
} from "../../domain/entities/Membership.js";
import { PersistenceTransaction } from "../../application/ports/TransactionPort.js";
import {
  CreateMembershipDTO,
  MembershipRepository,
} from "../../domain/repositories/MembershipRepository.js";
import type { Membership as MembershipModel } from "./models/membership.sequelize.js";

const toDomain = (row: MembershipModel): Membership =>
  Membership.fromPersistence({
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
  });

export class MembershipRepositorySequelize implements MembershipRepository {
  async findById(id: string): Promise<Membership | null> {
    const row = await models.Membership.findByPk(id);
    return row ? toDomain(row) : null;
  }

  async findByUserAndOrg(
    userId: string,
    organizationId: string,
  ): Promise<Membership | null> {
    const row = await models.Membership.findOne({
      where: { userId, organizationId, status: "active" },
    });
    return row ? toDomain(row) : null;
  }

  async findDefaultByUser(userId: string): Promise<Membership | null> {
    const row = await models.Membership.findOne({
      where: { userId, status: "active" },
      order: [["joinedAt", "ASC"]],
    });
    return row ? toDomain(row) : null;
  }

  async findAllByUser(userId: string): Promise<Membership[]> {
    const rows = await models.Membership.findAll({
      where: { userId },
      order: [["joinedAt", "ASC"]],
    });
    return rows.map(toDomain);
  }

  async findAllByOrganization(organizationId: string): Promise<Membership[]> {
    const rows = await models.Membership.findAll({
      where: { organizationId },
      order: [["joinedAt", "ASC"]],
    });
    return rows.map(toDomain);
  }

  async create(
    data: CreateMembershipDTO,
    tx?: PersistenceTransaction,
  ): Promise<Membership> {
    const transaction = tx as Transaction | undefined;
    const created = await models.Membership.create(
      {
        userId: data.userId,
        organizationId: data.organizationId,
        role: data.role,
        status: data.status ?? "active",
        joinedAt: new Date(),
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomain(created);
  }

  async save(membership: Membership): Promise<Membership> {
    const row = await models.Membership.findByPk(membership.id);
    if (!row) throw new Error("Membership not found");
    await row.update({
      role: membership.role,
    });
    await row.reload();
    return toDomain(row);
  }

  async countByOrgAndRole(
    organizationId: string,
    role: MembershipRole,
  ): Promise<number> {
    return models.Membership.count({
      where: { organizationId, role, status: "active" },
    });
  }

  async delete(id: string): Promise<void> {
    const row = await models.Membership.findByPk(id);
    if (!row) throw new Error("Membership not found");
    await row.destroy();
  }
}
