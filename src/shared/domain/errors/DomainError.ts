/**
 * Errors raised by the domain and application layers.
 *
 * A domain entity knows that a deadline cannot precede a start date. It does not
 * know that HTTP answers 400 to that — `AppError` carries a `statusCode`, and
 * importing it into `domain/` was the layering violation in SaaS-readiness caveat
 * C4. Entities and use cases throw a `kind`; the HTTP adapter decides the status
 * (`src/shared/middleware/error.ts`).
 *
 * See docs/internal/initiatives/feature-boundaries/decisions.md D-06, and
 * application-errors D-01 for the application layer.
 */
export type DomainErrorKind =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict";

export class DomainError extends Error {
  constructor(
    message: string,
    readonly kind: DomainErrorKind,
  ) {
    super(message);
    this.name = new.target.name;
    // Restores the prototype chain across the ES5 target boundary, so
    // `instanceof` holds for subclasses.
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, new.target);
  }
}

/** A value the domain refuses. The adapter renders this as 400. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "validation");
  }
}

/** The caller is not signed in, or not who they claim. Rendered as 401. */
export class UnauthorizedError extends DomainError {
  constructor(message: string) {
    super(message, "unauthorized");
  }
}

/** The caller is known but may not do this. Rendered as 403. */
export class ForbiddenError extends DomainError {
  constructor(message: string) {
    super(message, "forbidden");
  }
}

/** The thing asked for does not exist, or not for this caller. Rendered as 404. */
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, "not_found");
  }
}

/** The request clashes with what exists. Rendered as 409. */
export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
  }
}
