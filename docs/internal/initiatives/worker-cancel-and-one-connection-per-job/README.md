# Worker cancel and one connection per job

**Status:** Implemented on `fix/worker-cancel-and-one-connection-per-job`; PR open. Register
rows B-74 and B-75 (findings X60 and X62 of the dated run of 2026-10-20). D-02 and D-03 promoted
to [ADR-0077](../../../explanation/decisions/adr-0077-a-queued-job-holds-one-connection.md)
(Proposed). A dated run is owed to confirm both and restate GOLD.
**Slug:** `worker-cancel-and-one-connection-per-job` · **Branch:**
`fix/worker-cancel-and-one-connection-per-job`

**Why these two rows now.** They head the register's tier 1: the only things between this repo and
a clean GOLD (`FINAL-AUDIT-SUMMARY.md` § 8 item 13). D-01 alone would take B-74 first, as the
smaller; the owner chose both in one kit on 2026-10-21, at the standing priority of the most
demanding important work. The register's D-06 records the pairing.

- [Plan](worker-cancel-and-one-connection-per-job-plan.md) — goals, acceptance criteria, phases
- [Checklist](worker-cancel-and-one-connection-per-job-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
