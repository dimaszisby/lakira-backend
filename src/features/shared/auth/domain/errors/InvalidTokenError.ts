import { DomainError } from "@/shared/domain/errors/DomainError.js";

export class InvalidTokenError extends DomainError {
  constructor(message = "Unauthorized: Invalid token") {
    super(message, "unauthorized");
  }
}
