# Register rate limiter

**Status:** Merged in #127 (`abb5831`). D-01 and D-02 promoted to
[ADR-0053](../../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md).
**Slug:** `register-rate-limiter` · **Branch:** `fix/register-rate-limiter`

Standard kit. Fixes audit finding R1 (`docs/internal/audits/saas-readiness/audit-2026-09-29.md` § 6,
P2): `POST /auth/register` had no per-route limiter, and every registration emails the submitted
address. R1 stays open in the audit until a dated run confirms it (ADR-002).

- [Plan](register-rate-limiter-plan.md) — goals, acceptance criteria, phases
- [Checklist](register-rate-limiter-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
- Origin: [`2026-09-29-todo-register-rate-limiter.md`](../../todos/2026-09-29-todo-register-rate-limiter.md)
