import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { usernameRuleViolation } from "@/shared/constants/username-rule.js";
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

    // The handle rule applies to a new username only: one registered before the
    // rule, sent back unchanged with another field, is no change (#311, ADR-0101).
    if (input.username !== undefined && input.username !== user.username) {
      const violation = usernameRuleViolation(input.username);
      if (violation)
        throw new ValidationError(violation, { field: "username" });
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
