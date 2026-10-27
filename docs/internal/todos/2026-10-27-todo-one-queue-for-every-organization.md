# Todo — one job queue serves every organization, with no per-organization budget

- **Status:** Open. Register row B-97; waits on the owner's decision
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** N6 (P2) of `docs/internal/audits/saas-readiness/audit-2026-06-05.md` § 6.3, re-read
  on 2026-10-27 ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`src/shared/infrastructure/queue/topology.ts` declares one jobs exchange and one queue per job
type, shared by every organization. A publisher has no per-organization rate budget.

## Why it matters

One organization that enqueues many jobs (a bulk import, a dummy-data run) delays every other
organization's verification and reset emails behind it.

## The decision

Whether a template should ship fairness at all, and how: a per-organization publish budget, a
priority for email jobs, or separate queues for interactive and bulk work. Effort ≤1w, per the run.
