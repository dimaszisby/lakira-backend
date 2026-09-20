import { Organization } from "../entities/Organization.js";
import { PersistenceTransaction } from "../../application/ports/TransactionPort.js";

export type CreateOrganizationDTO = {
  name: string;
  slug: string;
};

export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findBySlug(slug: string): Promise<Organization | null>;
  existsBySlug(slug: string): Promise<boolean>;
  create(
    data: CreateOrganizationDTO,
    tx?: PersistenceTransaction,
  ): Promise<Organization>;
  save(organization: Organization): Promise<Organization>;
}
