# ADR-0008 — Store SHA-256 hash of reset token, never raw

- **Status:** Accepted
- **Date:** 2026-04-24
- **Origin:** `ADR-001` in the Password reset kit — [`features/password-reset`](../../internal/initiatives/features/password-reset/decisions.md)

---

## Context

Reset tokens give full account access for 15 min. A DB read by an attacker (backup leak, SQL injection elsewhere, log scrape) must not yield usable tokens.

## Decision

Generate raw token via `crypto.randomBytes(32).toString("base64url")`. Persist only `sha256(raw)` hex in `password_reset_tokens.token_hash`. Lookup hashes the incoming token before querying.

## Options considered

- Store raw token (rejected — DB compromise = account takeover window).
- Encrypt token with KMS (rejected — adds infra dep; sha256 is one-way and sufficient for short-lived single-use).
- bcrypt the token (rejected — slow on read path; sha256 is appropriate for high-entropy random tokens).

## Consequences

Must hash on every lookup. Token cannot be re-derived from DB (intended).

---
