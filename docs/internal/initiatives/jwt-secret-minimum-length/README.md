# `JWT_SECRET` minimum length, and a pinned algorithm

**Status:** Implemented on the branch, gates green; waits for the owner to commit and open the PR. Register rows B-07 (audit finding W2, P2) and B-17.
**Slug:** `jwt-secret-minimum-length` · **Branch:** `fix/jwt-secret-minimum-length`

Lean kit — no plan; acceptance criteria live in the checklist.

- [Checklist](jwt-secret-minimum-length-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries: the rule and where it applies, the pinned algorithm,
  and what was left out
- Origin: [`analysis-w2-jwt-secret.md`](../backend-debt-register/analysis-w2-jwt-secret.md);
  `docs/internal/audits/saas-readiness/audit-2026-10-12.md` § 6, W2
- Amends [ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)
