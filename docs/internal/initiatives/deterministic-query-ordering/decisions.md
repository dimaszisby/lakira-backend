# Deterministic Query Ordering — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Every ordered query that feeds a limit or a pick ends with a unique column

- **Status:** Accepted
- **Date:** 2026-09-30

Promoted to the architecture decision registry as **[ADR-0052](../../../explanation/decisions/adr-0052-ordered-queries-are-total.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — Queries over logs use `loggedAt`, not `createdAt`

- **Status:** Accepted
- **Date:** 2026-09-30

Promoted to the architecture decision registry as **[ADR-0052](../../../explanation/decisions/adr-0052-ordered-queries-are-total.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — Remove `findLatestByUserId` instead of patching it

- **Status:** Accepted
- **Date:** 2026-09-30

**Context.** `EmailVerificationTokenRepository.findLatestByUserId` has no production caller — only
its implementation, an integration test and two unit-test mocks. That integration test saves two
tokens back to back and expects the second, the same latent race as the CI flake.
**Decision.** Delete the method from the port and the implementation, and delete its tests and
mocks.
**Options considered.** Add the `id` tie-breaker and give the test explicit `createdAt` values:
rejected, it keeps unused code whose name promises "latest", which a random-UUID tie-breaker cannot
deliver.
**Consequences.** The port loses a method. A future caller re-adds it with an explicit ordering.
