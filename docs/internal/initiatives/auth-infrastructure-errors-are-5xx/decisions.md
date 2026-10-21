# Decisions — auth-infrastructure-errors-are-5xx

## D-01 — Only an invalid token answers 401

- **Status:** Proposed
- **Date:** 2026-10-21

**Context.** `makeAuthMiddleware` (`src/features/shared/auth/infrastructure/http/authMiddleware.ts`)
wrapped token verification and both repository lookups, `userRepo.findById` and
`membershipRepo.findByUserAndOrg`, in one bare `catch {}` that answered
`401 "Unauthorized: Invalid token"`. A pool timeout, a lost connection or a lock wait therefore
signed the user out, and nothing was logged. The dated run of 2026-10-20 reproduced it (X61): with
the `users` table renamed for one request, the answer was 401 and the only log line was the 401. It
is the likely mask for B-54, the intermittent 401 on register in the queue test.
`JwtTokenProvider.verify` already turns every token failure into `InvalidTokenError`, a
`DomainError` of kind `unauthorized`.

**Decision.** Verification gets its own `try`. A `DomainError` of kind `unauthorized` from it
becomes the existing `AppError("Unauthorized: Invalid token", 401)`; any other error goes to
`next(error)`. The lookups that follow sit in a `try` that forwards any error with `next(error)`,
since Express 4 does not catch a rejected async middleware. The global `errorHandler` then answers
500, masked in staging and production, and logs the error through the allowlist logger. The 401s
for a missing header, an unknown user, a token with no organization and an inactive membership are
unchanged.

**Options considered.** Checking for `InvalidTokenError` by class: a `DomainError` of kind
`unauthorized` also covers another `TokenProvider` that throws its own subclass. Answering 503 for
Sequelize connection errors: the error handler owns status mapping, and a logged 500 is what X61
asks for.

**Consequences.** A database failure during authentication is a 500, not a 401, so the frontend no
longer signs the user out on one. A Notion Part 2 record tells the frontend.
