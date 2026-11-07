# ADR-0089 — SENTRY_TRACES_SAMPLE_RATE is refused outside 0 to 1

- **Status:** Accepted
- **Date:** 2026-11-07
- **Related:** issue #247 (2026-06-05 run, § 4.4 and § 6.4, register row B-99); the same refusal
  at startup as [ADR-0088](./adr-0088-cors-origins-are-kept-as-origins.md) and `TRUST_PROXY`
- **Origin:** issue #247, planned and approved on 2026-11-07

---

## Context

`SENTRY_TRACES_SAMPLE_RATE` was `parseFloat` of the value, and `0` when that failed. So `5`, `-1`
and `0.5abc` (read as `0.5`) all started the app, and `src/server.ts` handed the result to
`Sentry.init({ tracesSampleRate })`. The other numeric settings refuse a bad value at startup,
naming the variable.

## Decision

- The value must be `0`, `1` or a decimal between them (`0.25`, `1.0`). Anything else is refused
  at startup with "SENTRY_TRACES_SAMPLE_RATE must be a number from 0 to 1, or be removed to use 0".
  That includes `.5`, an exponent, a sign and trailing text.
- Unset or blank means `0`. `SENTRY_DSN`, beside it in `.env.example`, is off when unset or
  blank, and a deployment that cleared both keeps starting.

## Options considered

- **Clamp to 0 to 1:** `5` would become `1`, full tracing, silently. A typo should not decide the
  tracing bill.
- **Refuse blank, as `TRUST_PROXY` does:** blank here pairs with a blank `SENTRY_DSN`, which
  already means off.

## Consequences

- A deployment holding a value outside 0 to 1 fails at startup, naming the variable.
