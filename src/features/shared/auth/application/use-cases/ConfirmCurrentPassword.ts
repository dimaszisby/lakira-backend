import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { AuthUser } from "../../domain/entities/AuthUser.js";
import { PasswordHasher } from "../ports/PasswordHasher.js";
import { CredentialAttemptsPort } from "../ports/CredentialAttemptsPort.js";

export const CURRENT_PASSWORD_INCORRECT = "Current password is incorrect";

/**
 * The proof a credential change asks for (credential-changes D-01). One place,
 * so a later "confirm once" step can replace it without touching the routes.
 * A wrong password is a 400 on the field, never a 401: the frontend's proxy
 * reads a 401 as a dead session and signs the user out.
 */
export class ConfirmCurrentPassword {
  constructor(
    private hasher: PasswordHasher,
    private attempts: CredentialAttemptsPort,
  ) {}

  async execute(user: AuthUser, currentPassword: string): Promise<void> {
    const matches = await this.hasher.compare(
      currentPassword,
      user.passwordHash,
    );
    // The attempt was counted before it reached here (the edge reserves it),
    // so a miss needs no write and a hit clears the count.
    if (!matches) {
      throw new ValidationError(CURRENT_PASSWORD_INCORRECT, {
        field: "currentPassword",
      });
    }
    await this.attempts.reset(user.id);
  }
}
