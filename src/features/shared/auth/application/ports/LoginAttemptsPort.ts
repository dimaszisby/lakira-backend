/**
 * Counts failed sign-ins toward the lockout (ADR-0032). `LoginUser` decides what a
 * failure is; the adapter decides how it is stored. Checking whether an address is
 * locked out stays at the HTTP edge, which answers 429 with `Retry-After`
 * (application-errors D-04).
 */
export interface LoginAttemptsPort {
  recordFailure(email: string): Promise<void>;
  reset(email: string): Promise<void>;
}
