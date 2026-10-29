# Todo — no tracing or metrics beyond Sentry's errors

- **Status:** Open. Issue #241 (was register row B-96); waits on the owner's decision on ADR-0038
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** N7 (P2) of `docs/internal/audits/saas-readiness/audit-2026-06-05.md` § 6.3, re-read
  on 2026-10-27 ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`package.json` holds no `@opentelemetry/*` and no metrics client. Sentry reports errors and
samples traces; latency, throughput and saturation are not measured.

## Why it matters

A P99 regression, or a pool or queue running hot, is invisible until a user reports it.

## Where it stands

[ADR-0038](../../explanation/decisions/adr-0038-observability-stack-as-attached-backing-service.md)
(Proposed, 2026-08-17) proposes OpenTelemetry in the app with the collectors as an attached
backing service. It has not been accepted, so this waits on that decision, not on code.
