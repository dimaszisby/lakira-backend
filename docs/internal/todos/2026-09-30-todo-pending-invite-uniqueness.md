# Todo — two concurrent invites for the same email and organization can both succeed

- **Status:** Open
- **Created:** 2026-09-30
- **Owner:** unassigned
- **Origin:** review of kit `deterministic-query-ordering` (checklist § Discovered)

---

## What

`InviteUserToOrganization` (`src/features/shared/auth/application/use-cases/InviteUserToOrganization.ts:50`)
refuses a second invite with 409 when `findPendingByEmailAndOrg` finds a pending one. That is a
check-then-insert: `organization_invites` has no unique or partial index on
`(organization_id, email)` for pending rows (`20260510000003-create-organization-invites.cjs` makes
only `token_hash` unique), so two concurrent requests can both pass the check and both insert.

Not an ordering defect: the one caller uses the query as an existence check, so which pending row
it returns does not matter.

## Suggested fix

A partial unique index on `(organization_id, lower(email)) WHERE accepted_at IS NULL`, with the
`UniqueConstraintError` mapped to the same 409. Expiry cannot be in the predicate (`now()` is not
immutable), so an expired pending invite would need revoking or deleting before re-inviting —
decide that first.
