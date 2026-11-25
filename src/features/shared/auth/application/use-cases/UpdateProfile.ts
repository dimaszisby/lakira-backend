import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";

/**
 * The profile fields only. The password and the email are credentials, changed
 * through their own routes, which ask for the current password
 * (credential-changes D-01).
 */
export type UpdateProfileInput = {
  userId: string;
  username?: string;
  isPublicProfile?: boolean;
};

export class UpdateProfile {
  constructor(private repo: UserRepository) {}

  async execute(input: UpdateProfileInput): Promise<AuthUser> {
    const { userId } = input;
    if (!userId) throw new UnauthorizedError("User not authenticated");

    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundError("User not found");

    if (input.username && input.username !== user.username) {
      if (await this.repo.existsByUsername(input.username))
        throw new ConflictError("Username already in use");
      user.changeUsername(input.username);
    }

    if (typeof input.isPublicProfile === "boolean") {
      user.togglePublicProfile(input.isPublicProfile);
    }

    return this.repo.save(user);
  }
}
