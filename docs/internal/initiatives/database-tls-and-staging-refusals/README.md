# Database TLS and staging refusals

**Status:** Done. Merged as #199 (`5818042`). Register row B-76 (X1) with X2 of row B-81.
D-01, D-02 and D-04 promoted as an amendment of
[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)
(its note of 2026-10-21). Before the next staging deploy, see D-03.
**Slug:** `database-tls-and-staging-refusals` · **Branch:** `fix/database-tls-and-staging-refusals`

Lean kit — no plan; acceptance criteria live in the checklist.

**Why this row now.** B-76 is the first `ready` row under the register's D-01: tier 1 is empty and
tier 2 waits on the owner and the frontend. The owner chose it, with X2, on 2026-10-21, after
setting the dated run aside. The register's D-07 records the pairing.

- [Checklist](database-tls-and-staging-refusals-checklist.md) — acceptance, work items, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
