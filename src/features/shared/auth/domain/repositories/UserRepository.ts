import { AuthUser } from "../entities/AuthUser.js";
import { PersistenceTransaction } from "../../application/ports/TransactionPort.js";

export type CreateUserDTO = {
  email: string;
  username: string;
  passwordHash: string;
  isPublicProfile: boolean;
};

export interface UserRepository {
  existsByEmail(email: string): Promise<boolean>;
  existsByUsername(username: string): Promise<boolean>;
  findById(id: string): Promise<AuthUser | null>;
  findByIds(ids: string[]): Promise<AuthUser[]>;
  findByEmail(email: string): Promise<AuthUser | null>;
  create(data: CreateUserDTO, tx?: PersistenceTransaction): Promise<AuthUser>;
  save(user: AuthUser): Promise<AuthUser>;
}
