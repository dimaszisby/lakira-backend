# ADR-0028 — Move SENSITIVE_KEY_PATTERN out of envManager.ts

- **Status:** Accepted
- **Date:** 2026-05-06
- **Origin:** `ADR-003` in the Observability kit — [`observability`](../../internal/initiatives/observability/decisions.md)
- **Note:** originally logged as _Implemented_.

---

## Context

The regex `/(password|secret|token|key|certificate|url)$/i` lives in `src/config/envManager.ts:6` today and is referenced by `maskedEnvSnapshot()` only. The Winston redactor needs the same regex, and `envManager.ts` is not the right home for a cross-cutting utility.

## Decision

Move the regex into `src/config/sensitive-keys.ts` exporting `SENSITIVE_KEY_PATTERN` and a `maskValue(key, value): unknown` helper. Update `envManager.ts` to import from there. Add unit tests.

## Options considered

- _Inline the regex in two places._ Rejected: drift risk; the audit specifically called out the redaction policy as a single source of truth.
- _Put it in `src/utils/`._ Rejected: `src/config/` is the existing home for environment + masking concerns; redaction key list is a config concern.

## Consequences

- One small module, one import-path change in `envManager.ts`.
- The Winston format and any future logger transport reuse the same definition.

## Links

- `audit-2026-05-01.md` § [P1-4.3]
- `src/config/envManager.ts:6`
- `src/utils/logger.ts`

---
