import { AuthUser } from "../entities/AuthUser.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";

export type CreateUserDTO = {
  email: string;
  username: string;
  passwordHash: string;
  isPublicProfile: boolean;
};

export interface UserRepository {
  existsByEmail(email: string): Promise<boolean>;
  existsByUsername(username: string): Promise<boolean>;
  /** Pass `tx` inside a transaction: a job holds one connection (ADR-0077). */
  findById(id: string, tx?: PersistenceTransaction): Promise<AuthUser | null>;
  findByIds(ids: string[]): Promise<AuthUser[]>;
  findByEmail(email: string): Promise<AuthUser | null>;
  create(data: CreateUserDTO, tx?: PersistenceTransaction): Promise<AuthUser>;
  save(user: AuthUser): Promise<AuthUser>;
}
