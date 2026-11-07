# ADR-0009 — Identical 200 response for known and unknown emails

- **Status:** Accepted
- **Date:** 2026-04-24
- **Origin:** `ADR-002` in the Password reset kit — [`features/password-reset`](../../internal/initiatives/features/password-reset/decisions.md)

---

## Context

`/forgot-password` is a classic enumeration vector — a 404 vs 200 leaks which emails have accounts.

## Decision

Always return 200 with a generic `"If an account exists for that email, we've sent reset instructions."` Email send (and DB write) only occur when the email is found. Send happens after the response shape is decided so failures don't change response shape or timing meaningfully.

## Options considered

- 404 on unknown email (rejected — leaks account existence).
- Synthetic delay on unknown email path to mask timing (rejected — adds complexity; the always-200 contract is strong enough; logs reveal which path ran for legitimate ops debugging).

## Consequences

Slightly harder to debug from API alone; logs (`[EMAIL:CONSOLE]` lines or Resend dashboard) are the source of truth.

---
