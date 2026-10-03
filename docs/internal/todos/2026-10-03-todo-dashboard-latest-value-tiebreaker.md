# Todo — the dashboard's latest value has no tiebreaker

- **Status:** Open (P2)
- **Created:** 2026-10-03
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 6, S7

---

## What

`src/features/public/analytics/infrastructure/sql/visualization.dashboard.sql.ts:70` ranks logs with
`row_number() OVER (PARTITION BY l.metric_id ORDER BY l.ts_tz DESC)`. Two logs of one metric at the
same instant can swap rank between runs, so `latest_value` varies. ADR-0052 decision 1 says every
ordered query ends in a unique column; this one was missed by #125.

## Suggested fix

Add `l.id DESC` (or the log's primary key) to the window's `ORDER BY`, with an integration test
that forces the tie, as `.claude/rules/testing.md` describes for ordered queries.
