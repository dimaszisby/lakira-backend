# Build image in CI

**Status:** Merged in #129 (`8222829`). D-01 and D-02 promoted to
[ADR-0055](../../../explanation/decisions/adr-0055-production-image-built-and-smoked-in-ci.md).
`Image Smoke` passed on the PR and on `dev`.
**Slug:** `build-image-in-ci` · **Branch:** `ci/build-image-in-ci`

Lean kit. Fixes audit finding R6 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6,
P2): no workflow built or started the production image, so a broken runtime image went unnoticed
(`cb99f50`), and ADR-0042 was `Accepted` without being implemented. R6 stays open in the audit
until a dated run confirms it (ADR-002).

- [Checklist](build-image-in-ci-checklist.md) — acceptance criteria, work items, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-09-29-todo-build-image-in-ci.md`](../../todos/2026-09-29-todo-build-image-in-ci.md)
