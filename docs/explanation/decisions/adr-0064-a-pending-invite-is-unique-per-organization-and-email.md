# ADR-0064 — A pending invite is unique per organization and email

- **Status:** Proposed
- **Date:** 2026-10-18
- **Related:** [ADR-0031](./adr-0031-invite-token-format-mirrors-password-reset.md) (the invite
  token and its lifetime); [ADR-0029](./adr-0029-fk-cascade-behaviour-on-organization-id.md)
  (invites cascade with their organization)
- **Origin:** `D-01` in the pending-invite-uniqueness kit —
  [`pending-invite-uniqueness`](../../internal/initiatives/pending-invite-uniqueness/decisions.md);
  register row B-24
  ([todo](../../internal/todos/2026-09-30-todo-pending-invite-uniqueness.md))

---

## Context

`InviteUserToOrganization` refused a second invite for one email with 409 when
`findPendingByEmailAndOrg` found a live one, and otherwise inserted. Nothing in the database backed
that check: `organization_invites` was unique only on `token_hash`. Two concurrent requests both
passed it, both inserted, and the invitee got two emails with two working links. The integration
test for this saw two 201s.

A partial unique index is the usual fix, but its `WHERE` cannot call `now()`, which is not
immutable. So an index can say "unaccepted" but not "unexpired", and re-inviting after an invite
expired worked: expired unaccepted rows already sat next to newer ones.

## Decision

- **The index:** `uq_organization_invites_pending_email` on
  `(organization_id, lower(email)) WHERE accepted_at IS NULL`. Case-insensitive, since the use case
  lowercases but the index must hold whatever writes the row.
- **Re-inviting** first deletes that organization and email's unaccepted invites that have expired,
  then checks for a live one as before, then inserts. The delete and the insert are not in one
  transaction: a delete that succeeds before a failed insert removes only rows nobody can accept.
- **The race** is lost at the index. The repository maps a violation of this index, and only this
  one, to the same `409 "An invitation is already pending for this email"`; the email is sent after
  the insert, so the loser sends none.
- **The migration** (`20261018000001-unique-pending-invite-per-email.cjs`) deletes expired
  unaccepted invites, then refuses, naming a count and no address, if two live invites still
  collide. Its transaction leaves the table as it was. `down` drops the index.

## Options considered

- **A `revoked_at` column, set instead of deleting.** Keeps a record of the earlier invite.
  Rejected by the owner: a second schema change, and nothing reads an expired invite;
  `AcceptInvite` refuses it.
- **On collision, keep the newest live invite and delete the rest.** The migration always
  succeeds. Rejected by the owner: an emailed link that still works would stop working unannounced.
- **A lock or a transaction around the check and the insert, no index.** Holds only on this code
  path; the database would still accept a duplicate from any other writer.

## Consequences

- No history of an expired invite survives a re-invite or the migration.
- A database holding two live invites for one email refuses the migration until one is removed by
  hand. Staging and production run migrations by hand (`npm run migrate:staging` /
  `migrate:production`), so a refusal stops the migration, not a deploy.
- Someone opening an expired link after its row was deleted gets the same `400 "Invalid or expired
invitation"` as before; not-found and expired already answered alike.

## Enforcement

- `__tests__/integration/api/organization-membership.test.ts` › "one pending invite per
  organization and email": the concurrent pair, a save that skips the check, re-invite after
  expiry, an accepted invite, and an address stored in another case.
- `__tests__/unit/features/auth/application/InviteUserToOrganization.test.ts`: the expired delete
  runs before the save, and a 409 from the save sends no email.

## Links

- Migration: `src/migrations/20261018000001-unique-pending-invite-per-email.cjs`
- Code: `src/features/shared/auth/application/use-cases/InviteUserToOrganization.ts`,
  `src/features/shared/auth/infrastructure/persistence/OrganizationInviteRepositorySequelize.ts`
- Reference: [`docs/reference/database-schema.md`](../../reference/database-schema.md) §
  `organization_invites`
