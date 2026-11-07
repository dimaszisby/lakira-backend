# Todo — `SENTRY_TRACES_SAMPLE_RATE` takes any number

- **Status:** Closed (2026-11-07) by issue #247 (was register row B-99): a value outside 0 to 1
  is refused at startup (ADR-0089)
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** § 4.4 and § 6.4 (P3, "LOW") of
  `docs/internal/audits/saas-readiness/audit-2026-06-05.md`, re-read on 2026-10-27
  ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`SENTRY_TRACES_SAMPLE_RATE` in `src/config/zodEnv.ts` is `parseFloat` of the value, and `0` when
that is `NaN`. `5`, `-1` and `0.5abc` (read as `0.5`) all start the app.

## Suggested fix

Refuse at startup a value that is not a number from 0 to 1, naming the variable, as the other
numeric variables do. A unit test for each edge.
