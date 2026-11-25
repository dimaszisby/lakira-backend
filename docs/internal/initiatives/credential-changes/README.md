# Credential changes

**Status:** Phase 1 built on `fix/309-credential-changes` (PR 1); Phase 2 next, on its own
branch.
Issue #309 (Y7 of the dated run of 2026-11-14, #299).
**Slug:** `credential-changes` · **Branches:** `fix/309-credential-changes` (the kit and Phase 1,
PR 1), `fix/309-credential-changes-email` (Phase 2, PR 2)

Standard kit. Two pull requests: the first splits credential changes out of `PUT /auth/profile` and
adds `POST /auth/change-password`; the second adds the pending email change. Neither says
`Closes #309`: the issue stays open until a dated run confirms the fix. D-01 is promoted to
ADR-0098 in PR 1, and D-02 to ADR-0099 in PR 2.

- [Plan](credential-changes-plan.md) — goals, acceptance criteria, phases
- [Checklist](credential-changes-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
