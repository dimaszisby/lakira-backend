import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";

export class GetProfile {
  constructor(private repo: UserRepository) {}

  async execute(userId: string): Promise<AuthUser> {
    if (!userId) throw new UnauthorizedError("User not authenticated");
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("User not found");
    return user;
  }
}
