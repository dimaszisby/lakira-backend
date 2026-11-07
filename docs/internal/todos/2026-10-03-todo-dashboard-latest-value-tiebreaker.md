# Todo — the dashboard's latest value has no tiebreaker

- **Status:** Fixed (Micro; kit
  [`deterministic-query-ordering`](../initiatives/deterministic-query-ordering/decisions.md) D-04;
  commits carry `refs: dashboard-latest-value-tiebreaker`). The cause differs from the one stated
  below: the logs tie on local time when a zone leaves daylight saving time, not on the instant,
  so the window now orders by `logged_at`, then `id`. Confirmed closed by the dated run of 2026-10-05 (`audit-2026-10-05.md` § 4.2); a P3 residue is its T4
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
