import { Organization } from "../entities/Organization.js";
import type {} from "@/shared/domain/PersistenceTransaction.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateOrganizationDTO = {
  name: string;
  slug: string;
};

export interface OrganizationRepository {
  /** Pass `tx` inside a transaction: a job holds one connection (ADR-0077). */
  findById(
    id: string,
    tx?: PersistenceTransaction,
  ): Promise<Organization | null>;
  findByIds(ids: string[]): Promise<Organization[]>;
  findBySlug(slug: string): Promise<Organization | null>;
  existsBySlug(slug: string): Promise<boolean>;
  create(
    data: CreateOrganizationDTO,
    tx?: PersistenceTransaction,
  ): Promise<Organization>;
  save(organization: Organization): Promise<Organization>;
}
