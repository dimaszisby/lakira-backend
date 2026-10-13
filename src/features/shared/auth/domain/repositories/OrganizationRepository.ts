import { Organization } from "../entities/Organization.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateOrganizationDTO = {
  name: string;
  slug: string;
};

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findByIds(ids: string[]): Promise<Organization[]>;
  findBySlug(slug: string): Promise<Organization | null>;
  existsBySlug(slug: string): Promise<boolean>;
  create(
    data: CreateOrganizationDTO,
    tx?: PersistenceTransaction,
  ): Promise<Organization>;
  save(organization: Organization): Promise<Organization>;
}
