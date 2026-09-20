import { Transaction } from "sequelize";
import { models } from "@/infrastructure/db/models.js";
import { Organization } from "../../domain/entities/Organization.js";
import { PersistenceTransaction } from "../../application/ports/TransactionPort.js";
import {
  CreateOrganizationDTO,
  OrganizationRepository,
} from "../../domain/repositories/OrganizationRepository.js";
import type { Organization as OrganizationModel } from "./models/organization.sequelize.js";

const toDomain = (row: OrganizationModel): Organization =>
  Organization.fromPersistence({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
    deletedAt: row.deletedAt ?? null,
  });

export class OrganizationRepositorySequelize implements OrganizationRepository {
  async findById(id: string): Promise<Organization | null> {
    const row = await models.Organization.findByPk(id);
    return row ? toDomain(row) : null;
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const row = await models.Organization.findOne({ where: { slug } });
    return row ? toDomain(row) : null;
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await models.Organization.count({ where: { slug } });
    return count > 0;
  }

  async create(
    data: CreateOrganizationDTO,
    tx?: PersistenceTransaction,
  ): Promise<Organization> {
    const transaction = tx as Transaction | undefined;
    const created = await models.Organization.create(
      {
        name: data.name,
        slug: data.slug,
      },
      { transaction },
    );
    await created.reload({ transaction });
    return toDomain(created);
  }

  async save(organization: Organization): Promise<Organization> {
    const row = await models.Organization.findByPk(organization.id);
    if (!row) throw new Error("Organization not found");
    await row.update({
      name: organization.name,
      slug: organization.slug,
      deletedAt: organization.deletedAt,
    });
    await row.reload();
    return toDomain(row);
  }
}
