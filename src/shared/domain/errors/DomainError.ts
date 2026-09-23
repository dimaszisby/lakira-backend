/**
 * Errors raised by the domain layer.
 *
 * A domain entity knows that a deadline cannot precede a start date. It does not
 * know that HTTP answers 400 to that — `AppError` carries a `statusCode`, and
 * importing it into `domain/` was the layering violation in SaaS-readiness caveat
 * C4. Entities throw a `kind`; the HTTP adapter decides the status
 * (`src/shared/middleware/error.ts`).
 *
 * See docs/internal/initiatives/feature-boundaries/decisions.md D-06.
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
