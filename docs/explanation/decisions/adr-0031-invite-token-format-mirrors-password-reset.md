# ADR-0031 — Invite-token format mirrors password-reset

- **Status:** Accepted
- **Date:** 2026-05-11
- **Related:** Mirrors the token handling in [ADR-0008](./adr-0008-hash-reset-tokens-never-store-raw.md).
- **Origin:** `ADR-003` in the Multi-tenancy kit — [`multi-tenancy`](../../internal/initiatives/multi-tenancy/decisions.md)

---

## Context

`organization_invites` is a token-by-email construct. The repo already has two examples: `password_reset_tokens` (sha256-hashed token, 15-min TTL, single-use) and the upcoming `email_verification_tokens` (sha256-hashed, 24-hour TTL, single-use). Inventing a third pattern would be drift.

## Decision

1. Identical schema shape: `id UUID PK`, `organization_id FK`, `email`, `role VARCHAR(20)`, `token_hash CHAR(64) UNIQUE` (sha256 hex), `expires_at`, `accepted_at NULL`, `created_at`.
2. Token TTL: 7 days (longer than email-verification because invitees may be unfamiliar with the product and take a while to act).
3. Anti-enumeration: `POST /invites/accept` returns the same generic 400 for invalid / expired / already-accepted.
4. Raw token only ever in the email body; only the hash hits the DB.

## Options considered

- _JWT-based invite._ Rejected: revocation requires a denylist anyway, and JWT structure leaks claims that aren't needed at acceptance time.
- _Single shared `tokens` table._ Rejected: each token type has different invariants and access patterns; a shared table forces a discriminator column and weakens types.

## Consequences

- One new template `organization-invite.ts`.
- One new use case pair (`InviteUserToOrganization`, `AcceptInvite`).
- Reuses the existing `EmailSender` port — no infrastructure additions.

## Links

- `multi-tenancy-plan.md` § Phase 6
- `docs/internal/initiatives/features/password-reset/` (reference pattern).
